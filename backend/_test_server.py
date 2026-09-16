from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/")
def root():
    return {"status": "ok"}

if __name__ == "__main__":
    print("Starting server on port 9876...", flush=True)
    config = uvicorn.Config(app, host="127.0.0.1", port=9876, log_level="debug")
    server = uvicorn.Server(config)
    server.run()