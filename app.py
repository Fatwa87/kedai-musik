import os
import sys
import time
import json
import socket
import re
import io
import base64
import ipaddress
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

from urllib.parse import quote, urlparse
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

# Max chunk size (2MB) keeps responses below Vercel's 4.5MB payload limit while
# reducing the number of round-trips for the proxy fallback.
MAX_CHUNK = 2 * 1024 * 1024

# Configure ffmpeg path safely (compatible with Vercel serverless / read-only environment)
try:
    FFMPEG_PATH = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_PATH = None

# Thread-safe in-memory caches
STREAM_CACHE = {}       # key: f"{video_id}_{type}" -> (url, expiry_timestamp, content_type)
STREAM_SIZE_CACHE = {}  # key: f"{video_id}_{type}" -> total bytes (from Content-Range)
STREAM_LOCKS = {}       # key: f"{video_id}_{type}" -> threading.Lock (avoids duplicate extraction)
STREAM_LOCKS_GUARD = threading.Lock()
SEARCH_CACHE = {}       # key: query_str -> (results, expiry_timestamp)
TRENDING_CACHE = {}     # key: category -> (results, expiry_timestamp)
LYRICS_CACHE = {}       # key: f"{title}_{artist}" -> lyrics_data

def get_stream_lock(key):
    """Return a per-stream lock so parallel requests share one yt-dlp extraction."""
    with STREAM_LOCKS_GUARD:
        lock = STREAM_LOCKS.get(key)
        if lock is None:
            lock = threading.Lock()
            STREAM_LOCKS[key] = lock
        return lock

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
    """
    Generate a base64 encoded PNG QR code.

    IMPORTANT: use pure black modules on a pure white background with a wide
    quiet zone. Dark/inverted QR codes (the old purple-on-black style) look
    nice but most phone camera apps simply refuse to decode them.
    """
    qr = qrcode.QRCode(
        version=None,  # let qrcode choose the smallest version that fits
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,      # standard 4-module quiet zone required by scanners
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format='PNG', optimize=True)
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
        'noplaylist': True,
        'socket_timeout': 15,
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

def is_private_hostname(hostname):
    """True for localhost / LAN / loopback hosts (not reachable from the internet)."""
    if not hostname:
        return True
    hostname = hostname.lower().strip('[]')
    if hostname in ('localhost', '127.0.0.1', '0.0.0.0', '::1'):
        return True
    try:
        ip = ipaddress.ip_address(hostname)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        return hostname.endswith('.local') or hostname.endswith('.lan')

def resolve_share_url():
    """
    Figure out the URL that a phone should open.

    - Local Windows + Cloudflare Tunnel -> use the public trycloudflare.com URL.
    - Vercel / Hugging Face / any real domain -> use the current request host.
      (The old code only handled Render, so the QR code pointed at an
      unreachable local/LAN IP on Vercel and Hugging Face.)
    - Localhost on the same PC -> use the LAN IP so the phone can connect.
    """
    local_ip = get_local_ip()
    local_url = f"http://{local_ip}:{PORT}"

    if PUBLIC_URL:
        return PUBLIC_URL, local_url, True

    if IS_RENDER:
        target = os.environ.get('RENDER_EXTERNAL_URL') or request.host_url.rstrip('/')
        return target, local_url, True

    hostname = urlparse(request.host_url).hostname
    if not is_private_hostname(hostname):
        # Running behind a public domain / reverse proxy (Vercel, HF Spaces, etc.)
        # Hugging Face / Vercel may not pass X-Forwarded-Proto through Flask,
        # so default to https for public hosts rather than generating an
        # http:// QR code that the phone has to redirect through.
        scheme = (request.headers.get('X-Forwarded-Proto') or '').split(',')[0].strip().lower()
        if scheme not in ('http', 'https'):
            scheme = 'https'
        target = f"{scheme}://{request.host}"
        return target, local_url, True

    return local_url, local_url, False

@app.route('/')
def index():
    target_url, local_url, is_public = resolve_share_url()
    qr_b64 = generate_qr_base64(target_url)
    return render_template('index.html', 
                           network_url=target_url, 
                           local_url=local_url,
                           public_url=target_url if is_public else None,
                           qr_b64=qr_b64, 
                           local_ip=get_local_ip(), 
                           port=PORT)

@app.route('/manifest.json')
def manifest():
    return send_from_directory(STATIC_DIR, 'manifest.json', mimetype='application/manifest+json')

@app.route('/sw.js')
def service_worker():
    return send_from_directory(STATIC_DIR, 'sw.js', mimetype='application/javascript')

@app.route('/api/network-info')
def network_info():
    target_url, local_url, is_public = resolve_share_url()
    return jsonify({
        'ip': get_local_ip(),
        'port': PORT,
        'local_url': local_url,
        'public_url': target_url if is_public else None,
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

def extract_stream_url(video_id, media_type='audio', client_configs=None):
    """
    Extract a fresh direct stream URL from YouTube using yt-dlp.

    Different player clients expose different formats: the default web
    clients give the small audio-only m4a (140), while the android clients
    are best for the progressive video format (18). Each media type
    therefore uses its own client order and falls back to the rest.

    `client_configs` may be supplied to force specific player clients
    (used by the diagnostics endpoint and cloud fallbacks).
    """
    if media_type == 'audio':
        # Prefer m4a/AAC (works everywhere incl. iOS). Fall back to Opus or
        # the progressive MP4 (18) which always contains audio.
        format_spec = '140/251/bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio/18/best'
        # The default web clients expose the small audio-only format 140.
        # (The android clients only expose muxed format 18 for many videos,
        # which makes the "audio" player download the whole 12MB video.)
        if client_configs is None:
            client_configs = [
                {},
                {'player_client': ['android']},
                {'player_client': ['android_vr']},
            ]
    else:
        # 18 = 360p progressive MP4 (audio + video in one file).
        format_spec = '18/22/best[ext=mp4]/best'
        # The android client is the most reliable source for format 18.
        if client_configs is None:
            client_configs = [
                {'player_client': ['android']},
                {'player_client': ['android_vr']},
                {},
            ]

    last_err = None
    for cfg in client_configs:
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'skip_download': True,
                'noplaylist': True,
                'ignoreerrors': False,
                'socket_timeout': 15,
                'format': format_spec,
                # Same bot-detection bypass as get_ydl_options — without this,
                # cloud IPs (Vercel/Render/HF Spaces) get blocked by YouTube.
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://www.youtube.com/'
                }
            }
            if cfg:
                ydl_opts['extractor_args'] = {'youtube': cfg}
            if FFMPEG_PATH and os.path.exists(FFMPEG_PATH):
                ydl_opts['ffmpeg_location'] = FFMPEG_PATH

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                if not info:
                    raise Exception('YouTube mengembalikan data kosong')
                stream_url = info.get('url')
                if stream_url:
                    ext = (info.get('ext') or '').lower()
                    if media_type == 'audio':
                        mime = 'audio/mp4' if ext in ('m4a', 'mp4', 'aac') else 'audio/webm'
                    else:
                        mime = 'video/mp4'
                    return stream_url, mime
                raise Exception('Format stream tidak ditemukan')
        except Exception as e:
            last_err = e
            continue

    raise Exception(f"Gagal mengekstrak stream YouTube: {last_err}")

def get_stream_url(video_id, media_type='audio', force_refresh=False):
    """
    Return (url, mime) from cache, extracting only once even when several
    parallel range requests arrive at the same time.
    """
    cache_key = f"{video_id}_{media_type}"
    now = time.time()

    if not force_refresh and cache_key in STREAM_CACHE:
        url, exp, mime = STREAM_CACHE[cache_key]
        if now < exp:
            return url, mime

    # Coalesce concurrent extractions (browser + prefetch, audio + proxy, ...)
    with get_stream_lock(cache_key):
        now = time.time()
        if not force_refresh and cache_key in STREAM_CACHE:
            url, exp, mime = STREAM_CACHE[cache_key]
            if now < exp:
                return url, mime

        stream_url, mime = extract_stream_url(video_id, media_type)
        # YouTube URLs are usually valid ~6h; refresh after 3h to be safe.
        STREAM_CACHE[cache_key] = (stream_url, now + 10800, mime)
        return stream_url, mime

def encode_stream_ref(url):
    """Encode a stream URL so the proxy can reuse it without re-running yt-dlp."""
    return base64.urlsafe_b64encode(url.encode('utf-8')).decode('ascii').rstrip('=')

def decode_stream_ref(value):
    """Decode + validate a stream URL supplied by the client."""
    if not value or len(value) > 8192:
        return None
    try:
        padded = value + '=' * (-len(value) % 4)
        url = base64.urlsafe_b64decode(padded.encode('ascii')).decode('utf-8')
        parsed = urlparse(url)
    except Exception:
        return None
    host = (parsed.hostname or '').lower()
    if parsed.scheme not in ('http', 'https'):
        return None
    # Only allow Google's media CDN, never an arbitrary URL (open proxy).
    if host != 'googlevideo.com' and not host.endswith('.googlevideo.com'):
        return None
    return url

@app.route('/api/playback/<video_id>')
def playback_info(video_id):
    """
    Resolve a playable URL.

    Direct-first is intentional: Google's CDN URLs include the server's IP,
    but in practice they are NOT enforced against the browser's IP (verified
    against a Vercel-generated URL from a different network). Playing the
    CDN directly removes Vercel's serverless proxy from the hot path, which
    is the difference between several seconds of buffering and instant start.
    The client falls back to /api/stream automatically if direct fails.
    """
    media_type = request.args.get('type', 'audio').lower()
    force = request.args.get('refresh') == '1'
    try:
        # Diagnostics: ?client=tv,web_safari forces specific player clients
        # and bypasses the cache. Used to find clients that survive YouTube's
        # datacenter-IP bot check when deployed on Vercel.
        client_param = request.args.get('client')
        if client_param:
            clients = [c.strip() for c in client_param.split(',') if c.strip()]
            stream_url, mime_type = extract_stream_url(
                video_id, media_type,
                client_configs=[{'player_client': clients}]
            )
        else:
            stream_url, mime_type = get_stream_url(video_id, media_type, force_refresh=force)
        proxy_url = (
            f'/api/stream/{video_id}?type={media_type}'
            f'&u={encode_stream_ref(stream_url)}'
        )
        response = jsonify({
            'success': True,
            'url': stream_url,
            'mime': mime_type,
            'proxy_url': proxy_url,
            'direct_ok': True,
            'expires_in': 5400  # keep client cache below the server's 3h cache
        })
        if not force and not client_param:
            # Cache the resolved URL at the edge for 30 minutes. Prefetch and
            # the user's tap then share one response instead of two cold
            # serverless invocations running yt-dlp.
            response.headers['Cache-Control'] = 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=600'
            response.headers['Vercel-CDN-Cache-Control'] = 'public, max-age=1800, stale-while-revalidate=600'
        else:
            response.headers['Cache-Control'] = 'no-store'
        return response
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def parse_content_range(value):
    """Parse 'bytes 0-1023/123456' -> (0, 1023, 123456)."""
    match = re.match(r'bytes\s+(\d+)-(\d+)/(\d+|\*)', (value or '').strip())
    if not match:
        return None
    total = None if match.group(3) == '*' else int(match.group(3))
    return int(match.group(1)), int(match.group(2)), total

@app.route('/api/stream/<video_id>')
def stream_media(video_id):
    """
    Stream proxy with HTTP 206 Partial Content support.

    The response body is relayed as it arrives from Google instead of
    buffering the whole chunk first, so playback starts much sooner and
    mobile browsers can seek without waiting for a full 1-2MB download.
    """
    media_type = request.args.get('type', 'audio').lower()
    upstream = None
    try:
        # The playback response embeds the resolved CDN URL in `u`, so each
        # range request can relay immediately. Without this, every 2MB chunk
        # on Vercel would cold-start a new function and re-run yt-dlp (2-5s).
        provided_url = decode_stream_ref(request.args.get('u'))
        if provided_url:
            stream_url = provided_url
            mime_type = 'audio/mp4' if media_type == 'audio' else 'video/mp4'
        else:
            stream_url, mime_type = get_stream_url(video_id, media_type)
        if not stream_url:
            return jsonify({'error': 'Stream URL not found'}), 404

        range_header = request.headers.get('Range')
        start_byte = 0
        end_byte = None
        size_key = f"{video_id}_{media_type}"

        if range_header and range_header.startswith('bytes='):
            range_spec = range_header[6:].strip()
            # Suffix range: bytes=-32768 (some mobile browsers request this
            # to read metadata). Convert it to an absolute range.
            if range_spec.startswith('-'):
                try:
                    suffix_len = int(range_spec[1:])
                    total_size = STREAM_SIZE_CACHE.get(size_key)
                    if not total_size:
                        probe = requests.get(
                            stream_url,
                            headers={'Range': 'bytes=0-0',
                                     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'},
                            timeout=6
                        )
                        parsed = parse_content_range(probe.headers.get('Content-Range'))
                        probe.close()
                        total_size = parsed[2] if parsed else int(probe.headers.get('Content-Length', 0) or 0)
                        if total_size:
                            STREAM_SIZE_CACHE[size_key] = total_size
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

        # Clamp each response to MAX_CHUNK so every request stays below
        # Vercel's 4.5MB payload limit.
        if end_byte is None or (end_byte - start_byte + 1) > MAX_CHUNK:
            requested_end = start_byte + MAX_CHUNK - 1
        else:
            requested_end = end_byte

        forward_headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Range': f'bytes={start_byte}-{requested_end}'
        }

        def open_upstream(url):
            return requests.get(url, headers=forward_headers, stream=True, timeout=(6, 30))

        upstream = open_upstream(stream_url)

        # If the token expired or Google rejected it, refresh and retry once.
        # NOTE: 416 (Range Not Satisfiable) is a NORMAL EOF case when the
        # client asks for bytes past the file end — do not re-extract for it.
        if upstream.status_code in (403, 404, 410):
            upstream.close()
            STREAM_CACHE.pop(f"{video_id}_{media_type}", None)
            stream_url, mime_type = get_stream_url(video_id, media_type, force_refresh=True)
            upstream = open_upstream(stream_url)

        status_code = upstream.status_code

        response_headers = {
            'Content-Type': upstream.headers.get('Content-Type', mime_type),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Range, Content-Type, Accept',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
            'Cache-Control': 'public, max-age=3600',
            'X-Accel-Buffering': 'no'
        }

        if status_code == 416:
            length_marker = upstream.headers.get('Content-Range', '').strip()
            if length_marker.startswith('bytes */'):
                response_headers['Content-Range'] = length_marker
            upstream.close()
            response_headers['Content-Length'] = '0'
            return Response(b'', status=416, headers=response_headers)

        if status_code not in (200, 206):
            upstream.close()
            return jsonify({'error': f'YouTube CDN error {status_code}'}), 502

        cr = upstream.headers.get('Content-Range', '').strip()
        if status_code == 206 and cr:
            response_headers['Content-Range'] = cr
            parsed = parse_content_range(cr)
            if parsed:
                expected_bytes = parsed[1] - parsed[0] + 1
                if parsed[2]:
                    STREAM_SIZE_CACHE[size_key] = parsed[2]
            else:
                expected_bytes = None
        else:
            length = upstream.headers.get('Content-Length')
            expected_bytes = int(length) if length and length.isdigit() else None

        if expected_bytes is not None:
            response_headers['Content-Length'] = str(expected_bytes)

        def relay():
            """Yield CDN bytes immediately; close the upstream on disconnect."""
            try:
                for chunk in upstream.iter_content(chunk_size=64 * 1024):
                    if chunk:
                        yield chunk
            except Exception as exc:
                print("Stream relay error:", exc)
            finally:
                upstream.close()

        return Response(relay(), status=status_code, headers=response_headers)

    except Exception as e:
        if upstream is not None:
            try:
                upstream.close()
            except Exception:
                pass
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
