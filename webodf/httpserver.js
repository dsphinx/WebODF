/*global require console process Buffer*/
/* A Node.JS http server*/
var sys = require("sys"),
    http = require("http"),
    url = require("url"),
    path = require("path"),
    fs = require("fs");

http.createServer(function (request, response) {
    var uri = url.parse(request.url).pathname,
        filename = path.join(process.cwd(), uri);
    if (uri !== '/favicon.ico') {
        console.log(request.method + " " + uri);
    }
    function put() {
        var contentlength = parseInt(request.headers["content-length"], 10),
            alldata = new Buffer(contentlength), sum = 0;
        request.on("data", function (data) {
            data.copy(alldata, sum, 0);
            sum += data.length;
        });
        request.on("end", function () {
            fs.writeFile(filename, alldata, "binary", function (err) {
                if (err) {
                    response.writeHead(500);
                    response.write(err);
                } else {
                    response.writeHead(200);
                }
                response.end();
            });
        });
    }
    if (request.method === "PUT") {
        put(request, response);
        return;
    }
    if (request.method === "DELETE") {
        fs.unlink(filename, function (err) {
            if (err) {
                response.writeHead(500);
            } else {
                response.writeHead(200);
            }
            response.end();
        });
        return;
    }
    fs.stat(filename, function (err, stats) {
        if (!err && stats.isFile()) {
            fs.readFile(filename, "binary", function (err, file) {
                if (err) {
                    response.writeHead(500, {"Content-Type": "text/plain"});
                    if (request.method !== "HEAD") {
                        response.write(err + "\n");
                    }
                    response.end();
                    return;
                }
                var head = {"Content-Length": stats.size};
                if (filename.substr(-3) === ".js") {
                    head["Content-Type"] = "text/javascript";
                } else if (filename.substr(-4) === ".css") {
                    head["Content-Type"] = "text/css";
                }
                response.writeHead(200, head);
                if (request.method !== "HEAD") {
                    response.write(file, "binary");
                }
                response.end();
            });
        } else if (!err && stats.isDirectory()) {
            if (uri.length === 0 || uri[uri.length - 1] !== "/") {
                response.writeHead(301, {"Content-Type": "text/plain",
                        "Location": uri + "/"});
                if (request.method !== "HEAD") {
                    response.write("Moved permanently\n");
                }
                response.end();
                return;
            }
            fs.readdir(filename, function (err, files) {
                if (err) {
                    response.writeHead(500, {"Content-Type": "text/plain"});
                    if (request.method !== "HEAD") {
                        response.write(err + "\n");
                    }
                    response.end();
                    return;
                }
                response.writeHead(200);
                if (request.method !== "HEAD") {
                    files.sort();
                    response.write("<html><head><title></title></head><body>");
                    response.write("<table>");
                    var i, l = files.length, file;
                    for (i = 0; i < l; i += 1) {
                        file = files[i].replace("&", "&amp;")
                                .replace("<", "&gt;");
                        response.write("<tr><td><a href=\"");
                        response.write(file);
                        response.write("\">");
                        response.write(file.replace("\"", "\\\""));
                        response.write("</a></td></tr>\n");
                    }
                    response.write("</table></body></html>\n");
                }
                response.end();
            });
        } else {
            if (uri !== '/favicon.ico') {
                console.log("Not found: " + uri);
            }
            response.writeHead(404, {"Content-Type": "text/plain"});
            if (request.method !== "HEAD") {
                response.write("404 Not Found\n");
            }
            response.end();
        }
    });
}).listen(8124, "127.0.0.1");

console.log('Server running at http://127.0.0.1:8124/');
