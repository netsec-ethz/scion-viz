# Go Visualizations

These are instructions for setting up this repo within the scion infrastructure to view visual web results from an AS deployment or test environment.

To run the Go Web UI at default localhost 127.0.0.1:8000 use:

    ```
    go run go/webapp/webapp.go
    ```

To run the Go Web UI at a specific address and port like 10.2.0.15:8080 and set the file browser to start form the local directory use:

    ```
    go run go/webapp/webapp.go -a 10.2.0.15 -p 8080 -r .
    ```
