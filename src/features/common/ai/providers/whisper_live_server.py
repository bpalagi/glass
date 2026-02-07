"""
Minimal WhisperLive server launcher for Glass app.
Starts a faster_whisper backend on a configurable port.
"""
import sys
import argparse
from whisper_live.server import TranscriptionServer

def main():
    parser = argparse.ArgumentParser(description="WhisperLive Server for Glass")
    parser.add_argument("--port", type=int, default=9090, help="WebSocket port")
    parser.add_argument("--model", type=str, default="small", help="Whisper model size")
    args = parser.parse_args()

    server = TranscriptionServer()
    model_path = args.model if "/" in args.model else None
    print(f"[WhisperLive] Starting server on port {args.port} with model={args.model}", flush=True)
    server.run(
        "0.0.0.0",
        port=args.port,
        backend="faster_whisper",
        faster_whisper_custom_model_path=model_path,
        single_model=True,
    )

if __name__ == "__main__":
    main()
