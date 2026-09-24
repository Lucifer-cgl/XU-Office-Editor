import argparse
import os
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class CrossOriginHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--open", action="store_true")
    args = parser.parse_args()
    os.chdir(args.root)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), CrossOriginHandler)
    except OSError:
        server = ThreadingHTTPServer(("127.0.0.1", 0), CrossOriginHandler)
    prefix = f"http://127.0.0.1:{server.server_address[1]}/"
    print(f"XU Office Editor started: {prefix}", flush=True)
    print("Close this window to stop the local server.", flush=True)
    if args.open:
        webbrowser.open(prefix)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
