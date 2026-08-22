# 基于 pin 过的 ttyd 镜像，附加学习终端所需的 node/npm/git
FROM dockerproxy.net/tsl0922/ttyd@sha256:9355735b28a407fe7fb09597f6773d5550f2502259d22b350a2e2460125f9072
RUN apk add --no-cache nodejs npm git
