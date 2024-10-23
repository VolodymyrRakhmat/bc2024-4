const http = require('http');
const { program } = require('commander');
const url = require('url');
const fs = require('fs').promises;
const superagent = require("superagent");

// Налаштування параметрів командного рядка
program
  .requiredOption('-h, --host <URL>', "Host URL")
  .requiredOption('-p, --port <num>', 'Port of server')
  .requiredOption('-c, --cache <path>', "Path to cache files");

// Обробка помилок при неправильних параметрах
program.configureOutput({
  writeErr: (str) => {
    console.error('Required parameter not found');
    process.exit(1);
  }
});

program.parse();
let options = program.opts();

// Перевірка наявності обов'язкових параметрів
if (!options.host || !options.port || !options.cache) {
  throw new Error('Missing required parameters');
}

// Змінні для використання в сервері
const serverHost = options.host;
const serverPort = options.port;
const cachePath = options.cache;

// Функції для роботи з файлами
const writeFile = (path, data) => {
  return fs.writeFile(path, data);
};

const readFile = (filePath) => {
  return fs.readFile(filePath);
};

const checkFileExists = (path) => {
  return fs.access(path);
};

// Головна функція сервера
function baseServer(req, res) {
  let parsedUrl = url.parse(req.url);
  let requestPath = parsedUrl.pathname;
  let fullPath = cachePath + requestPath + ".jpg"; // Шлях до кешованого зображення

  switch (req.method) {
    case "GET": {
      checkFileExists(fullPath)
        .then(() => {
          return readFile(fullPath);
        })
        .then(result => {
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.write(result);
          res.end();
          console.log("Served from cache");
        })
        .catch(() => {
          superagent.get('https://http.cat' + requestPath)
            .buffer(true)
            .then((response) => {
              res.writeHead(200, { 'Content-Type': 'image/jpeg' });
              res.write(response.body);
              res.end();
              console.log("Served from external server");

              // Запис у кеш
              writeFile(fullPath, response.body)
                .catch(() => {
                  console.error("Cannot save file to cache");
                });
            })
            .catch(() => {
              res.writeHead(404, { 'Content-Type': 'text/html' });
              res.write("404 Not Found on external server");
              res.end();
            });
        });
      break;
    }
    case "PUT": {
      superagent.get('https://http.cat' + requestPath)
        .buffer(true)
        .then((response) => {
          return writeFile(fullPath, response.body);
        })
        .then(() => {
          res.writeHead(201, { 'Content-Type': 'text/html' });
          res.write('Photo written to cache');
        })
        .catch(() => {
          res.writeHead(422, { 'Content-Type': 'text/html' });
          res.write("Error writing photo to cache");
        })
        .finally(() => {
          console.log("PUT request complete");
          res.end();
        });
      break;
    }
    case "DELETE": {
      checkFileExists(fullPath)
        .then(() => {
          return fs.unlink(fullPath); // Видалення кешованого зображення
        })
        .then(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end("Image deleted");
        })
        .catch(() => {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.write("404 Image not found. Not deleted");
          res.end();
        });
      break;
    }
    default: {
      res.writeHead(405, { 'Content-Type': 'text/html' });
      res.end("405 Method Not Allowed");
      break;
    }
  }
}

// Створення сервера
const server = http.createServer(baseServer);
server.listen(serverPort, serverHost, () => {
  console.log(`Server running at http://${serverHost}:${serverPort}/`);
});
