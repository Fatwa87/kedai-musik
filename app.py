import os
import sys
import time
import json
import socket
import re
import io
import base64
import subprocess
import threading

# Ensure UTF-8 output on Windows consoles
try:
    if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from urllib.parse import quote
from flask import Flask, request, jsonify, render_template, Response, send_file, send_from_directory, redirect
import requests
import yt_dlp
import imageio_ffmpeg
import qrcode

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')

app = Flask(__name__, static_folder=STATIC_DIR, template_folder=TEMPLATE_DIR)
PORT = int(os.environ.get('PORT', 5500))
IS_RENDER = os.environ.get('RENDER') is not None
PUBLIC_URL = os.environ.get('RENDER_EXTERNAL_URL') if IS_RENDER else None
CLOUDFLARED_PROC = None

# Max chunk size (1MB) ensures sub-second responses and avoids Vercel 4.5MB payload limit
MAX_CHUNK = 1024 * 1024

# Configure ffmpeg path safely (compatible with Vercel serverless / read-only environment)
try:
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_PATH = None

# Thread-safe in-memory caches
STREAM_CACHE = {}     # key: f"{video_id}_{type}" -> (url, expiry_timestamp, content_type)
SEARCH_CACHE = {}     # key: query_str -> (results, expiry_timestamp)
TRENDING_CACHE = {}   # key: category -> (results, expiry_timestamp)
LYRICS_CACHE = {}     # key: f"{title}_{artist}" -> lyrics_data

def get_local_ip():
    """Find the local WiFi / LAN IP of this computer."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1.0)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

def format_duration(seconds):
    """Format seconds into MM:SS or HH:MM:SS."""
    if not seconds:
        return "0:00"
    try:
        sec = int(seconds)
        hours = sec // 3600
        mins = (sec % 3600) // 60
        secs = sec % 60
        if hours > 0:
            return f"{hours}:{mins:02d}:{secs:02d}"
        return f"{mins}:{secs:02d}"
    except Exception:
        return "0:00"

def format_views(view_count):
    """Format view count into readable short format (e.g. 1.2M, 540K)."""
    if not view_count:
        return ""
    try:
        vc = int(view_count)
        if vc >= 1_000_000_000:
            return f"{vc / 1_000_000_000:.1f}B tayangan"
        if vc >= 1_000_000:
            return f"{vc / 1_000_000:.1f}M tayangan"
        if vc >= 1_000:
            return f"{vc / 1_000:.1f}K tayangan"
        return f"{vc} tayangan"
    except Exception:
        return ""

def clean_song_title(title):
    """Clean track title by removing boilerplate tags like (Official Video), [HD], etc."""
    cleaned = re.sub(r'\(.*?(official|video|audio|lirik|lyric|hd|mv|remastered|hq).*?\)', '', title, flags=re.IGNORECASE)
    cleaned = re.sub(r'\[.*?(official|video|audio|lirik|lyric|hd|mv|remastered|hq).*?\]', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def generate_qr_base64(url):
    """Generate a base64 encoded PNG QR code."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#7c3aed", back_color="#090a10")
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def start_cloudflared_tunnel():
    """Start Cloudflare Tunnel in background to bypass AP/Client Isolation and firewalls (local Windows only)."""
    global PUBLIC_URL, CLOUDFLARED_PROC
    if IS_RENDER or sys.platform != 'win32':
        return

    cf_path = os.path.join(BASE_DIR, 'cloudflared.exe')
    if not os.path.exists(cf_path):
        return

    try:
        cmd = [cf_path, 'tunnel', '--url', f'http://127.0.0.1:{PORT}']
        CLOUDFLARED_PROC = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        for line in CLOUDFLARED_PROC.stdout:
            m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line)
            if m:
                PUBLIC_URL = m.group(0)
                print(f"\n[CLOUDFLARE HTTPS TUNNEL AKTIF]")
                print(f"👉 Link HP Bebas Blokir: {PUBLIC_URL}")
                print(f"Scan ulang QR code di aplikasi untuk membuka link ini di HP Anda!\n")
                break
    except Exception as e:
        print("Cloudflare Tunnel startup error:", e)

# Launch Cloudflare tunnel thread
threading.Thread(target=start_cloudflared_tunnel, daemon=True).start()

def get_ydl_options(extract_flat=True, format_spec='140/251/18/bestaudio/best'):
    opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'ignoreerrors': True,
        # Critical: YouTube bot-detection blocks datacenter IPs (Vercel/Render/HF)
        # unless we send a real browser User-Agent + Referer to the player API.
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.youtube.com/'
        }
    }
    if FFMPEG_PATH and os.path.exists(FFMPEG_PATH):
        opts['ffmpeg_location'] = FFMPEG_PATH
    if extract_flat:
        opts['extract_flat'] = True
    else:
        opts['format'] = format_spec
    return opts

@app.route('/')
def index():
    local_ip = get_local_ip()
    local_url = f"http://{local_ip}:{PORT}"
    
    if IS_RENDER:
        target_url = os.environ.get('RENDER_EXTERNAL_URL') or request.host_url.rstrip('/')
    else:
        target_url = PUBLIC_URL if PUBLIC_URL else local_url

    qr_b64 = generate_qr_base64(target_url)
    return render_template('index.html', 
                           network_url=target_url, 
                           local_url=local_url,
                           public_url=target_url if (IS_RENDER or PUBLIC_URL) else None,
                           qr_b64=qr_b64, 
                           local_ip=local_ip, 
                           port=PORT)

@app.route('/manifest.json')
def manifest():
    return send_from_directory(STATIC_DIR, 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def service_worker():
    return send_from_directory(STATIC_DIR, 'sw.js', mimetype='application/javascript')

@app.route('/api/network-info')
def network_info():
    local_ip = get_local_ip()
    local_url = f"http://{local_ip}:{PORT}"
    
    if IS_RENDER:
        target_url = os.environ.get('RENDER_EXTERNAL_URL') or request.host_url.rstrip('/')
        pub_url = target_url
    else:
        target_url = PUBLIC_URL if PUBLIC_URL else local_url
        pub_url = PUBLIC_URL

    return jsonify({
        'ip': local_ip,
        'port': PORT,
        'local_url': local_url,
        'public_url': pub_url,
        'url': target_url,
        'qr': generate_qr_base64(target_url)
    })

@app.route('/api/suggestions')
def suggestions():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])
    try:
        url = f"https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q={quote(q)}"
        r = requests.get(url, timeout=3)
        if r.status_code == 200:
            data = r.json()
            return jsonify(data[1][:8])
    except Exception as e:
        print("Suggestion error:", e)
    return jsonify([])

@app.route('/api/search')
def search():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])

    try:
        limit = int(request.args.get('limit', 50))
    except (ValueError, TypeError):
        limit = 50
    limit = max(10, min(limit, 100))

    now = time.time()
    cache_key = f"{query.lower()}_{limit}"
    if cache_key in SEARCH_CACHE:
        cached_res, exp = SEARCH_CACHE[cache_key]
        if now < exp:
            return jsonify(cached_res)

    try:
        ydl_opts = get_ydl_options(extract_flat=True)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
            entries = res.get('entries', []) or []
            
            clean_entries = []
            for e in entries:
                if not e or not e.get('id'):
                    continue
                vid_id = e.get('id')
                raw_title = e.get('title') or 'Lagu'
                clean_title = clean_song_title(raw_title)
                artist = e.get('channel') or e.get('uploader') or 'Artis'
                duration = e.get('duration') or 0
                views = e.get('view_count') or 0
                
                thumb = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                if e.get('thumbnails') and len(e['thumbnails']) > 0:
                    thumb = e['thumbnails'][-1].get('url') or thumb

                clean_entries.append({
                    'id': vid_id,
                    'title': clean_title,
                    'raw_title': raw_title,
                    'artist': artist,
                    'duration': duration,
                    'duration_formatted': format_duration(duration),
                    'thumbnail': thumb,
                    'views': format_views(views)
                })

            SEARCH_CACHE[cache_key] = (clean_entries, now + 900)  # 15 min cache
            return jsonify(clean_entries)
    except Exception as e:
        print("Search error:", e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/trending')
def trending():
    cat = request.args.get('category', 'indo').lower()
    now = time.time()
    
    if cat in TRENDING_CACHE:
        cached_res, exp = TRENDING_CACHE[cat]
        if now < exp:
            return jsonify(cached_res)

    category_queries = {
        'indo': 'Lagu Pop Indonesia Terbaru Viral Hits',
        'global': 'Top 50 Global Popular Music Hits',
        'chill': 'Lofi Hip Hop Chill Beats relaxing study',
        'koplo': 'Dangdut Koplo Terbaru Viral Joget',
        'rock': 'Best Classic Rock & Alternative Hits',
        'anime': 'Popular Anime Opening Songs J-Pop',
        'acoustic': 'Acoustic Cover Hits Lagu Santai Akustik'
    }

    query = category_queries.get(cat, category_queries['indo'])
    try:
        ydl_opts = get_ydl_options(extract_flat=True)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            res = ydl.extract_info(f"ytsearch15:{query}", download=False)
            entries = res.get('entries', []) or []
            
            clean_entries = []
            for e in entries:
                if not e or not e.get('id'):
                    continue
                vid_id = e.get('id')
                raw_title = e.get('title') or 'Lagu'
                clean_title = clean_song_title(raw_title)
                artist = e.get('channel') or e.get('uploader') or 'Artis'
                duration = e.get('duration') or 0
                views = e.get('view_count') or 0
                thumb = f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"

                clean_entries.append({
                    'id': vid_id,
                    'title': clean_title,
                    'raw_title': raw_title,
                    'artist': artist,
                    'duration': duration,
                    'duration_formatted': format_duration(duration),
                    'thumbnail': thumb,
                    'views': format_views(views)
                })

            TRENDING_CACHE[cat] = (clean_entries, now + 3600)  # 1 hour cache
            return jsonify(clean_entries)
    except Exception as e:
        print("Trending error:", e)
        return jsonify([]), 500

@app.route('/api/info/<video_id>')
def video_info(video_id):
    try:
        ydl_opts = get_ydl_options(extract_flat=False, format_spec='140/251/bestaudio[ext=m4a]/bestaudio/best')
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            raw_title = info.get('title') or ''
            clean_title = clean_song_title(raw_title)
            artist = info.get('channel') or info.get('uploader') or ''
            duration = info.get('duration') or 0
            
            return jsonify({
                'id': video_id,
                'title': clean_title,
                'raw_title': raw_title,
                'artist': artist,
                'duration': duration,
                'duration_formatted': format_duration(duration),
                'thumbnail': f"https://i.ytimg.com/vi/{video_id}/maxresdefault.jpg",
                'thumbnail_fallback': f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                'views': format_views(info.get('view_count')),
                'description': info.get('description', '')[:300]
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def get_stream_url(video_id, media_type='audio', force_refresh=False):
    """
    Extract direct stream URL from YouTube using yt-dlp with multiple client fallbacks.
    - audio: uses pure audio (140=m4a AAC, 251=webm Opus) or format 18.
    - video: uses format 18 (progressive MP4 with audio + video combined).
    """
    cache_key = f"{video_id}_{media_type}"
    now = time.time()
    
    if not force_refresh and cache_key in STREAM_CACHE:
        url, exp, mime = STREAM_CACHE[cache_key]
        if now < exp:
            return url, mime

    client_configs = [
        {'player_client': ['ios', 'android', 'web']},
        {'player_client': ['android']},
        {'player_client': ['ios']},
        {'player_client': ['web']}
    ]

    if media_type == 'audio':
        format_spec = '140/251/18/bestaudio[ext=m4a]/bestaudio/best'
    else:
        format_spec = '18/best'

    last_err = None
    for cfg in client_configs:
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'skip_download': True,
                'format': format_spec,
                'extractor_args': {'youtube': cfg},
                # Same bot-detection bypass as get_ydl_options — without this,
                # cloud IPs (Vercel/Render/HF Spaces) get blocked by YouTube.
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.youtube.com/'
                }
            }
            if FFMPEG_PATH and os.path.exists(FFMPEG_PATH):
                ydl_opts['ffmpeg_location'] = FFMPEG_PATH

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                stream_url = info.get('url')
                if stream_url:
                    ext = info.get('ext', '')
                    if media_type == 'audio':
                        mime = 'audio/mp4' if ext in ['m4a', 'mp4', 'aac'] else 'audio/webm'
                    else:
                        mime = 'video/mp4'

                    STREAM_CACHE[cache_key] = (stream_url, now + 10800, mime)
                    return stream_url, mime
        except Exception as e:
            last_err = e
            continue

    raise Exception(f"Gagal mengekstrak stream YouTube: {last_err}")

@app.route('/api/playback/<video_id>')
def playback_info(video_id):
    media_type = request.args.get('type', 'audio').lower()
    try:
        stream_url, mime_type = get_stream_url(video_id, media_type)
        return jsonify({
            'success': True,
            'url': stream_url,
            'mime': mime_type,
            'proxy_url': f'/api/stream/{video_id}?type={media_type}'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/stream/<video_id>')
def stream_media(video_id):
    """
    Ultra-reliable stream proxy supporting HTTP 206 Partial Content (Range requests).
    Chunks data in max 1MB blocks to guarantee 100% compatibility with Vercel,
    Render, Cloudflare, and mobile browsers without timeouts or payload limits.
    """
    media_type = request.args.get('type', 'audio').lower()
    try:
        stream_url, mime_type = get_stream_url(video_id, media_type)
        if not stream_url:
            return jsonify({'error': 'Stream URL not found'}), 404

        range_header = request.headers.get('Range')
        
        start_byte = 0
        end_byte = None
        
        if range_header and range_header.startswith('bytes='):
            range_spec = range_header[6:].strip()
            # Handle suffix range: e.g. bytes=-32768 (requested by mobile browser for metadata)
            if range_spec.startswith('-'):
                try:
                    suffix_len = int(range_spec[1:])
                    total_size = STREAM_CACHE.get(f"{video_id}_{media_type}_size")
                    if not total_size:
                        h = requests.head(stream_url, timeout=5)
                        total_size = int(h.headers.get('Content-Length', 0))
                        STREAM_CACHE[f"{video_id}_{media_type}_size"] = total_size
                    if total_size and total_size > 0:
                        start_byte = max(0, total_size - suffix_len)
                        end_byte = total_size - 1
                except Exception:
                    start_byte = 0
            else:
                parts = range_spec.split('-')
                if parts[0]:
                    try:
                        start_byte = int(parts[0])
                    except ValueError:
                        start_byte = 0
                if len(parts) > 1 and parts[1]:
                    try:
                        end_byte = int(parts[1])
                    except ValueError:
                        end_byte = None

        # Clamp chunk to MAX_CHUNK (1MB) to ensure sub-second response on Vercel
        if end_byte is None or (end_byte - start_byte + 1) > MAX_CHUNK:
            requested_end = start_byte + MAX_CHUNK - 1
        else:
            requested_end = end_byte

        forward_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': f'bytes={start_byte}-{requested_end}'
        }

        # Request chunk from GoogleVideo CDN
        upstream = requests.get(stream_url, headers=forward_headers, timeout=12)
        
        # If upstream token expired or returned 403/410, refresh stream URL
        # NOTE: 416 (Range Not Satisfiable) is a NORMAL EOF case when the
        # client asks for bytes past the file end — we must NOT treat it as
        # "expired token" or we waste a re-extraction on every song end.
        if upstream.status_code in (403, 404, 410):
            STREAM_CACHE.pop(f"{video_id}_{media_type}", None)
            stream_url, mime_type = get_stream_url(video_id, media_type, force_refresh=True)
            upstream = requests.get(stream_url, headers=forward_headers, timeout=12)

        status_code = upstream.status_code
        # Build a CORRECT Content-Length that matches the exact bytes we return.
        # Copying Content-Length blindly from upstream is wrong when we clamped
        # the request to MAX_CHUNK or when the file ended early: the browser
        # then waits for bytes that never arrive (the classic "stuck spinner"
        # / "track fails to load" bug on mobile).
        cr = upstream.headers.get('Content-Range', '').strip()
        if status_code == 206:
            # upstream's Content-Range header (e.g. "bytes 1048576-2097151/8405914")
            # describes exactly the bytes in the body, so keep it verbatim and
            # only fix Content-Length to the actual payload size.
            response_bytes = len(upstream.content)
        else:
            cr = None
            response_bytes = len(upstream.content)

        response_headers = {
            'Content-Type': upstream.headers.get('Content-Type', mime_type),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
            'Cache-Control': 'public, max-age=3600'
        }

        if cr:
            response_headers['Content-Range'] = cr
        response_headers['Content-Length'] = str(response_bytes)

        return Response(upstream.content, status=status_code, headers=response_headers)

    except Exception as e:
        print("Stream error:", e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/lyrics')
def lyrics():
    title = request.args.get('title', '').strip()
    artist = request.args.get('artist', '').strip()
    
    clean_title = clean_song_title(title)
    clean_title = re.sub(r'feat\..*|ft\..*', '', clean_title, flags=re.IGNORECASE).strip()
    clean_artist = re.sub(r'feat\..*|ft\..*|- Topic|Official', '', artist, flags=re.IGNORECASE).strip()
    
    cache_key = f"{clean_title}_{clean_artist}".lower()
    if cache_key in LYRICS_CACHE:
        return jsonify(LYRICS_CACHE[cache_key])
        
    try:
        params = {'track_name': clean_title, 'artist_name': clean_artist}
        r = requests.get('https://lrclib.net/api/get', params=params, timeout=4)
        if r.status_code == 200:
            data = r.json()
            result = {
                'synced': data.get('syncedLyrics'),
                'plain': data.get('plainLyrics'),
                'found': True
            }
            LYRICS_CACHE[cache_key] = result
            return jsonify(result)
            
        search_res = requests.get('https://lrclib.net/api/search', params={'q': f"{clean_title} {clean_artist}"}, timeout=4)
        if search_res.status_code == 200:
            hits = search_res.json()
            if hits and len(hits) > 0:
                best = hits[0]
                result = {
                    'synced': best.get('syncedLyrics'),
                    'plain': best.get('plainLyrics'),
                    'found': True
                }
                LYRICS_CACHE[cache_key] = result
                return jsonify(result)
                
    except Exception as e:
        print("Lyrics fetch error:", e)

    return jsonify({'found': False, 'message': 'Lirik belum tersedia untuk lagu ini.'})

@app.route('/api/download/<video_id>')
def download_track(video_id):
    """Download audio stream file directly to mobile phone storage (Vercel & cloud compatible)."""
    try:
        stream_url, _ = get_stream_url(video_id, 'audio')
        return redirect(stream_url, code=302)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    local_ip = get_local_ip()
    local_url = f"http://{local_ip}:{PORT}"
    
    print("\n" + "="*60)
    print("  [KEDAI MUSIK] PEMUTAR MUSIK YOUTUBE TANPA IKLAN")
    print("="*60)
    print(f"  [PC / Local]   : http://localhost:{PORT}")
    print(f"  [HP / WiFi]    : {local_url}")
    print("="*60)
    print("  Sedang menyiapkan Cloudflare Tunnel untuk koneksi HP bebas blokir...")
    print("="*60 + "\n")
    
    app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
