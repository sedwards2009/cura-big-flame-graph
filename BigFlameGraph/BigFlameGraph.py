# Copyright (c) 2016 Ultimaker B.V.
# Cura is released under the terms of the AGPLv3 or higher.
import threading
from http.server import HTTPServer
from http.server import BaseHTTPRequestHandler
import webbrowser

from UM.Extension import Extension
from PyQt5.QtCore import QObject
from UM import Logger
import os.path
from UM import Signal

class BigFlameGraph(Extension, QObject):
    def __init__(self, parent = None):
        QObject.__init__(self, parent)
        Extension.__init__(self)
        self.addMenuItem("Start BFG", startBFG)
        self.addMenuItem("Stop BFG", stopBFG)

http_server_thread = None
PORT = 8000

def startBFG():
    global http_server_thread
    http_server_thread = HTTPServerThread()
    http_server_thread.daemon = True
    http_server_thread.start()

def stopBFG():
    global http_server_thread
    if http_server_thread is not None:
        http_server_thread.shutdown()
        http_server_thread = None

class HTTPServerThread(threading.Thread):
    def __init__(self):
        super().__init__()
        self._httpd = None

    def run(self):
        Signal.clearProfileData()
        server_address = ('', PORT)
        self._httpd = HTTPServer(server_address, BFGHandler)
        webbrowser.open("http://localhost:" + str(PORT))
        self._httpd.serve_forever()

    def shutdown(self):
        if self._httpd is not None:
            self._httpd.shutdown()

# This maps file name to mimetypes. It also provides a way of making sure that we only server valid files.
resource_mimetype_map = {
    "index.html": "text/html",
    "stylesheet.css": "text/css",
    "code.js": "text/javascript",
    "d3-color.js": "text/javascript",
    "d3-collection.js": "text/javascript",
    "d3-dispatch.js": "text/javascript",
    "d3-hierarchy.js": "text/javascript",
    "d3-interpolate.js": "text/javascript",
    "d3-scale.js": "text/javascript",
    "d3-selection.js": "text/javascript",
    "d3-request.js": "text/javascript",
    "progress.gif": "image/gif"
}

class BFGHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Respond to a GET request."""
        if self.path == "/":
            self.send_response(302)
            self.send_header("Location", "/index.html")
            self.end_headers()
        elif self.path == "/profile.json":
            self._handleProfile()
        else:
            self.send_response(200)

            filename = self.path[1:]
            if filename not in resource_mimetype_map:
                self.send_response(404)
                return

            full_filename = os.path.join(os.path.dirname(__file__), "resources", filename)
            with open(full_filename, 'rb') as fhandle:
                data = fhandle.read()

            self.send_header("Content-type", resource_mimetype_map[filename])
            self.send_header("Content-Length", len(data))
            self.end_headers()
            self.wfile.write(data)

    def do_POST(self):
        if self.path == "/record":
            Signal.clearProfileData()
            Signal.recordProfileData()
            self.send_response(200)
            self.send_header("Content-type", "text/json")
            self.send_header("Content-Length", 0)
            self.end_headers()

        elif self.path == "/stop":
            Signal.stopRecordProfileData()
            self.send_response(200)
            self.send_header("Content-type", "text/json")
            self.send_header("Content-Length", 0)
            self.end_headers()

    def _handleProfile(self):
        profile_data = Signal.getProfileData()

        if profile_data is not None:
            str_data = profile_data.toJSON(root=True)
        else:
            # Empty data
            str_data = """{
  "c": {
    "callStats": {
      "stack": [
        "[app]",
        "no data",
        0,
        10
      ],
      "children": []
    }
    "runTime": 10,
    "totalSamples": 10
  }
}
"""
        data = bytes(str_data, encoding="utf8")
        self.send_response(200)
        self.send_header("Content-type", "text/json")
        self.send_header("Content-Length", len(data))
        self.end_headers()
        self.wfile.write(data)
