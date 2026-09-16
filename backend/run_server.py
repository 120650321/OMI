"""uvicorn 启动脚本 - 兼容 Python 3.14"""
import os
import sys
import signal
import asyncio
import time

os.chdir(os.path.dirname(os.path.abspath(__file__)))

from main import app
import uvicorn

config = uvicorn.Config(
    app=app,
    host="0.0.0.0",
    port=8000,
    log_level="info",
    reload=False,
    loop="asyncio",
)
server = uvicorn.Server(config)

_orig_handle_exit = server.handle_exit
server._start_time = time.monotonic()

def handle_exit_with_delay(sig, frame):
    elapsed = time.monotonic() - server._start_time
    if elapsed > 2.0:
        _orig_handle_exit(sig, frame)

server.handle_exit = handle_exit_with_delay

async def main():
    await server.serve()

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(main())
    except KeyboardInterrupt:
        pass
    finally:
        loop.close()