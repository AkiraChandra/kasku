#!/usr/bin/env python3
import hmac
import hashlib
import json
import subprocess
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 9001
SECRET = os.environ.get("DEPLOY_SECRET", "kasku-secret-deploy-token")
PROJECT_DIR = "/home/akira04/projects/kasku"

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            self.send_response(404)
            self.end_headers()
            return

        # Read body
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len)

        # Verify signature if header is present
        signature_header = self.headers.get("X-Hub-Signature-256")
        if signature_header:
            hash_object = hmac.new(SECRET.encode("utf-8"), msg=body, digestmod=hashlib.sha256)
            expected_signature = "sha256=" + hash_object.hexdigest()
            if not hmac.compare_digest(expected_signature, signature_header):
                self.send_response(403)
                self.end_headers()
                self.wfile.write(b"Invalid signature")
                return

        try:
            payload = json.loads(body.decode("utf-8"))
            ref = payload.get("ref", "")
            # Only trigger on main branch push
            if ref == "refs/heads/main" or not ref:
                print(f"[Webhook] Triggering deploy for ref: {ref}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status": "deploying"}')
                
                # Execute deploy script asynchronously or in subprocess
                subprocess.Popen(["/bin/bash", os.path.join(PROJECT_DIR, "deploy.sh")])
                return
            else:
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"status": "ignored_branch"}')
                return
        except Exception as e:
            print(f"[Webhook] Error: {e}")
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode("utf-8"))

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status": "ok", "service": "kasku-deploy-webhook"}')

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), WebhookHandler)
    print(f"Deploy webhook server running on port {PORT}...")
    server.serve_forever()
