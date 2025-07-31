FROM envoyproxy/envoy:contrib-v1.35-latest

ARG POSTGRES_HOST
ARG POSTGRES_PORT

ENV POSTGRES_HOST=$POSTGRES_HOST
ENV POSTGRES_PORT=$POSTGRES_PORT

RUN apt-get update && apt-get install -y gettext-base curl

COPY envoy.yaml /envoy.yaml.template

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["envsubst < /envoy.yaml.template > /tmp/envoy.yaml && exec envoy -c /tmp/envoy.yaml --log-level info"]
