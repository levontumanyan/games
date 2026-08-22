import uvicorn


def main():
	uvicorn.run("app:create_app", host="127.0.0.1", port=8766, reload=True, factory=True)


if __name__ == "__main__":
	main()
