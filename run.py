import os
import subprocess
import sys

if __name__ == '__main__':
    from app import app, get_local_ip, PORT
    local_ip = get_local_ip()
    print(f"\nMenjalankan Kedai Musik di http://{local_ip}:{PORT} ...")
    app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)
