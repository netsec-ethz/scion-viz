# Go Visualizations

These are instructions for setting up this repo within the scion infrastructure to view visual web results from an AS deployment or test environment.

You may need to add some required packages to run the current code:

    ```
    go get golang.org/x/image
    ```

To run the Go Web UI at default localhost 127.0.0.1:8000 use:

    ```
    go run go/web/server.go
    ```

To run the Go Web UI at a specific address and port like 10.2.0.15:8080 and set the file browser to start form the local directory use:

    ```
    go run go/web/server.go -a 10.2.0.15 -p 8080 -root .
    ```
