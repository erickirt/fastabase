FROM timberio/vector:0.28.1-alpine

ARG SPLUNK_TOKEN

ENV SPLUNK_TOKEN=$SPLUNK_TOKEN

COPY vector.yml /etc/vector/vector.yml

CMD ["--config", "/etc/vector/vector.yml", "--color", "never"]
