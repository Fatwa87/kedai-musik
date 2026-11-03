import urllib.request
import json
import time
import sys

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

base = "http://127.0.0.1:5500"

def test_endpoints():
    print("Testing / ...")
    with urllib.request.urlopen(f"{base}/") as res:
        print("Status /:", res.status)
        assert res.status == 200

    print("Testing /manifest.json ...")
    with urllib.request.urlopen(f"{base}/manifest.json") as res:
        print("Status /manifest.json:", res.status)
        assert res.status == 200

    print("Testing /api/network-info ...")
    with urllib.request.urlopen(f"{base}/api/network-info") as res:
        data = json.loads(res.read().decode())
        print("Network info:", data['url'])
        assert 'url' in data

    print("Testing /api/suggestions ...")
    with urllib.request.urlopen(f"{base}/api/suggestions?q=tulus") as res:
        data = json.loads(res.read().decode())
        print("Suggestions:", data[:3])
        assert isinstance(data, list)

    print("Testing /api/trending ...")
    with urllib.request.urlopen(f"{base}/api/trending?category=indo") as res:
        data = json.loads(res.read().decode())
        print("Trending tracks count:", len(data))
        if len(data) > 0:
            print("First trending track:", data[0]['title'])
            first_id = data[0]['id']
            
            print(f"Testing /api/stream/{first_id}?type=audio with Range ...")
            req = urllib.request.Request(f"{base}/api/stream/{first_id}?type=audio", headers={'Range': 'bytes=0-1024'})
            with urllib.request.urlopen(req) as stream_res:
                print("Stream status:", stream_res.status, "Content-Type:", stream_res.headers.get('Content-Type'))
                chunk = stream_res.read(1024)
                print("Streamed bytes:", len(chunk))
                assert len(chunk) > 0

    print("\nALL ENDPOINT TESTS PASSED SUCCESSFULLY! 🎉")

if __name__ == '__main__':
    test_endpoints()
