import redis
import time
import math

class RedisMonitor:
    """
    Monitor Redis keys and send updates to all web socket clients.
    """

    def __init__(self, host="localhost", port=6379, db=0, refresh_rate=0.5, key_filter="", realtime=False):
        """
        If realtime is specified, RedisMonitor will enable notifications for all
        set events and subscribe to these notifications.
        """

        self.host = host
        self.port = port
        self.db = db
        self.refresh_rate = refresh_rate
        self.key_filter = key_filter
        self.realtime = realtime

        self.redis_db = redis.Redis(host=self.host, port=self.port, db=self.db, decode_responses=False)
        self.message_last = {}

        if self.realtime:
            self.pubsub = self.redis_db.pubsub()
            self.lock = threading.Lock()
            self.message_buffer = []

            #  Need to perform the following command to enable keyevent notifications:
            #  config set notify-keyspace-events "$E"
            notify_keyspace_events = self.redis_db.config_get("notify-keyspace-events")["notify-keyspace-events"]
            if "$" not in notify_keyspace_events and "A" not in notify_keyspace_events:
                # Add string commands to notifications
                notify_keyspace_events += "$"
            if "E" not in notify_keyspace_events:
                # Add keyevent events to notifications
                notify_keyspace_events += "E"
            self.redis_db.config_set("notify-keyspace-events", notify_keyspace_events)

            self.pubsub.psubscribe("__keyevent@%s__:set" % self.db)

    def messenger(self, ws_server):
        """
        When realtime is set, this thread sends messages to all web socket
        clients every refresh_rate seconds.
        """

        while True:
            time.sleep(self.refresh_rate)

            self.lock.acquire()
            if not self.message_buffer:
                self.lock.release()
                continue

            keyvals = self.message_buffer
            self.message_buffer = []
            self.lock.release()

            ws_server.lock.acquire()
            for client in ws_server.clients:
                client.send(ws_server.encode_message(keyvals))
            ws_server.lock.release()

    def parse_val(self, key, skip_unchanged=True):
        """
        Get the value from Redis and parse if it's an array.
        If skip_unchanged = True, only returns values updated since the last call.
        """
        import re

        def isnumeric(s):
            """
            Helper function to test if string is a number
            """
            try:
                float(s)
                return True
            except ValueError:
                return False

        if self.key_filter and re.match(self.key_filter, key) is None:
            return

        val = self.redis_db.get(key)

        # Skip if the value hasn't changed
        if skip_unchanged:
            if key in self.message_last and val == self.message_last[key]:
                return None
        self.message_last[key] = val

        try:
            # If the first element is a number, try converting all the elements to numbers
            val = val.decode("utf-8")
        except:
            # Otherwise, leave it as a string
            pass

        return val

    def run_forever(self, ws_server):
        """
        Listen for redis keys (either realtime or every refresh_rate seconds)
        and send updated values to all web socket clients every refresh_rate seconds.
        """
        if not self.realtime:
            # Send messages to clients every refresh_rate seconds
            prev_keys = set()
            while True:
                time.sleep(self.refresh_rate)

                key_vals = []
                new_keys = set()
                for key in self.redis_db.scan_iter():
                    if self.redis_db.type(key) != b"string":
                        continue
                    new_keys.add(key.decode("utf-8"))

                    val = self.parse_val(key)
                    if val is None:
                        continue
                    key_vals.append((key.decode("utf-8"), val))

                del_keys = list(prev_keys - new_keys)
                prev_keys = new_keys
                if not key_vals and not del_keys:
                    continue

                ws_server.lock.acquire()
                for client in ws_server.clients:
                    client.send(ws_server.encode_message({"update": key_vals, "delete": del_keys}))
                ws_server.lock.release()

        else:
            # Create thread to send messages to client with refresh rate
            messenger_thread = threading.Thread(target=self.messenger, args=(ws_server,))
            messenger_thread.daemon = True
            messenger_thread.start()

            # Listen for redis notifications
            for msg in self.pubsub.listen():
                if msg["pattern"] is None:
                    continue

                key = msg["data"]
                val = self.parse_val(key)
                if val is None:
                    continue

                self.lock.acquire()
                self.message_buffer.append((key, val))
                self.lock.release()

    def initialize_client(self, ws_server, client):
        """
        On first connection, send client all Redis keys.
        """

        key_vals = []

        # TODO: Don't disrupt other clients
        self.message_last = {}
        for key in sorted(self.redis_db.scan_iter()):
            if self.redis_db.type(key) != b"string":
                continue

            val = self.parse_val(key, skip_unchanged=False)
            if val is None:
                continue

            key_vals.append((key.decode("utf-8"), val))

        client.send(ws_server.encode_message({"update": key_vals, "delete": []}))
