#!/usr/bin/env python
"""
server.py

Copyright 2018. All Rights Reserved.

Created: April 13, 2017
Authors: Toki Migimatsu
"""

from __future__ import print_function, division
import threading
from multiprocessing import Process
from argparse import ArgumentParser
import json
import os
import shutil

import sys
WEB_DIRECTORY = os.path.join(os.path.dirname(__file__), "web")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "python")))
from RedisMonitor import RedisMonitor
from WebSocketServer import WebSocketServer
from HTTPRequestHandler import makeHTTPRequestHandler

if sys.version.startswith("3"):
    from http.server import HTTPServer
else:
    from BaseHTTPServer import HTTPServer

args = None
app_thread = None

def start_app(app_name, app_target):
    global app_thread
    if app_thread is not None:
        print("Killing %s" % app_thread.name)
        app_thread.terminate()
    print("Starting %s app" % app_name)
    app_thread = Process(target=app_target)
    app_thread.start()

def make_handle_get_request(redis_monitor):
    def handle_get_request(request_handler, get_vars, **kwargs):
        """
        HTTPRequestHandler callback:

        Serve content inside WEB_DIRECTORY
        """
        global app_thread
        path_tokens = [token for token in request_handler.path.split("/") if token]

        apps = {
            #"dh": dh_app,
        }

        # Default to index.html
        if not path_tokens or ".." in path_tokens:
            request_path = os.path.join(WEB_DIRECTORY, "index.html")
        elif path_tokens[0] == "get_websocket_port":
            request_handler.wfile.write(str(kwargs["ws_port"]).encode("utf-8"))
            return
        elif len(path_tokens) > 2 and path_tokens[0] == "resources":
            path_resources = redis_monitor.redis_db.smembers("webapp::resources::{}".format(path_tokens[1]))
            request_path = None
            if path_resources is not None:
                for path_resource in path_resources:
                    request_path = os.path.join(path_resource.decode("utf-8"), *path_tokens[2:])
                    print(request_path)
                    if os.path.isfile(request_path):
                        break
                    request_path = None

            if request_path is None:
                request_path = os.path.join(WEB_DIRECTORY, *path_tokens)
        else:
            file_ext = os.path.splitext(path_tokens[0])
            if len(file_ext) == 2 and file_ext[1] == ".html" and file_ext[0] in apps:
                app_name = file_ext[0]
                if app_thread is not None:
                    print("Killing %s" % app_thread.name)
                    app_thread.terminate()
                print("Starting %s app" % app_name)
                app_thread = Process(target=apps[app_name])
                app_thread.start()
            request_path = os.path.join(WEB_DIRECTORY, *path_tokens)

        # Check if file exists
        if not os.path.isfile(request_path):
            print(request_path)
            request_handler.send_error(404, "File not found.")
            return

        # Otherwise send file directly
        with open(request_path, "rb") as f:
            shutil.copyfileobj(f, request_handler.wfile)

    return handle_get_request

def handle_post_request(request_handler, post_vars, **kwargs):
    """
    HTTPRequestHandler callback:

    Set POST variables as Redis keys
    """
    path_tokens = [token for token in request_handler.path.split("/") if token]

    if not path_tokens or ".." in path_tokens:
        return
    if path_tokens[0] == "DEL":
        keys = [key for key, _ in post_vars.items()]
        if not keys:
            return
        if type(keys[0]) is bytes:
            keys = [k.decode("utf-8") for k in keys]

        result = kwargs["redis_db"].delete(*keys)
        print("DEL {}: {}".format(" ".join(keys), result))

    elif path_tokens[0] == "SET":
        for key, val_str in post_vars.items():
            if type(val_str[0]) is bytes:
                val_json = json.loads(val_str[0].decode("utf-8"))
            else:
                val_json = json.loads(val_str[0])

            try:
                types = (str, unicode)
            except:
                types = (str,)

            if type(val_json) in types:
                val = val_json
            elif type(val_json) is dict:
                val = json.dumps(val_json)
            else:
                val = "; ".join(" ".join(map(str, row)) for row in val_json)
            print("%s: %s" % (key, val))
            kwargs["redis_db"].set(key, val)


if __name__ == "__main__":
    # Parse arguments
    parser = ArgumentParser(description=(
        "Monitor Redis keys in the browser."
    ))
    parser.add_argument("-hp", "--http_port", help="HTTP Port (default: 8000)", default=8000, type=int)
    parser.add_argument("-wp", "--ws_port", help="WebSocket port (default: 8001)", default=8001, type=int)
    parser.add_argument("-rh", "--redis_host", help="Redis hostname (default: 127.0.0.1)", default="127.0.0.1")
    parser.add_argument("-rp", "--redis_port", help="Redis port (default: 6379)", default=6379, type=int)
    parser.add_argument("-rd", "--redis_db", help="Redis database number (default: 0)", default=0, type=int)
    parser.add_argument("-r", "--refresh_rate", help="Redis refresh rate in seconds (default: 0.05)", default=0.05, type=float)
    parser.add_argument("-kf", "--key_filter", help="Regex filter for Redis keys to monitor (default: \"\")", default="", type=str)
    parser.add_argument("--realtime", action="store_true", help="Subscribe to realtime Redis SET pubsub notifications")
    args = parser.parse_args()

    # Create RedisMonitor, HTTPServer, and WebSocketServer
    print("Starting up server...\n")
    redis_monitor = RedisMonitor(host=args.redis_host, port=args.redis_port, db=args.redis_db,
                                 refresh_rate=args.refresh_rate, key_filter=args.key_filter, realtime=args.realtime)
    print("Connected to Redis database at %s:%d (db %d)" % (args.redis_host, args.redis_port, args.redis_db))
    get_post_args = {"ws_port": args.ws_port, "redis_db": redis_monitor.redis_db}
    http_server = HTTPServer(("", args.http_port),
                             makeHTTPRequestHandler(make_handle_get_request(redis_monitor), handle_post_request, get_post_args))
    ws_server = WebSocketServer(port=args.ws_port)

    # Start HTTPServer
    http_server_process = Process(target=http_server.serve_forever)
    http_server_process.start()
    print("Started HTTP server on port %d" % (args.http_port))

    # Start WebSocketServer
    ws_server_thread = threading.Thread(target=ws_server.serve_forever, args=(redis_monitor.initialize_client,))
    ws_server_thread.daemon = True
    ws_server_thread.start()
    print("Started WebSocket server on port %d\n" % (args.ws_port))

    # Start RedisMonitor
    print("Server ready. Listening for incoming connections.\n")
    redis_monitor.run_forever(ws_server)

    http_server_process.join()
