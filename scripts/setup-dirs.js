#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const base = process.env.DATA_FOLDER_PATH
    ? (path.isAbsolute(process.env.DATA_FOLDER_PATH)
        ? process.env.DATA_FOLDER_PATH
        : path.join(process.cwd(), process.env.DATA_FOLDER_PATH))
    : path.join(process.cwd(), 'data');

['backups', 'temp', 'db', 'mac-db', '.service-state'].forEach(dir => {
    fs.mkdirSync(path.join(base, dir), { recursive: true });
});
