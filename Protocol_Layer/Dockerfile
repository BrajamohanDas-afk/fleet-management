FROM golang:1.21-alpine AS build

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /protocol-layer .

FROM alpine:3.20
RUN apk add --no-cache ffmpeg ca-certificates
COPY --from=build /protocol-layer /usr/local/bin/protocol-layer
ENTRYPOINT ["/usr/local/bin/protocol-layer"]
