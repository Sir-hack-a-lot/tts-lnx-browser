"""CLI-entry: start de helper op 127.0.0.1:5020 (nooit extern bereikbaar)."""
import uvicorn

from .server import create_app


def main() -> None:
    uvicorn.run(create_app(), host="127.0.0.1", port=5020, log_level="warning")


if __name__ == "__main__":
    main()
