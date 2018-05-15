require('dotenv').load();
const mysql = require('mysql');
const Queue = require('better-queue');
const storage = require('azure-storage');

const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
const blobService = storage.createBlobService();
const connPool = mysql.createPool({
  connectionLimit: 125,
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB
});

const q = new Queue(updateSasUri, { concurrent: 15, autoResume: false });
loadQueue();
console.log(`Starting db updates.`);


function loadQueue() {
  connPool.getConnection((err, conn) => {
    if (err) console.error(err);
    conn.query(
      `SELECT model_id, file_name FROM images`,
      (err, rows) => {
        if (err) throw err;
        rows.forEach(row => {
          const jobData = {
            modelId: row.model_id,
            fileName: row.file_name
          };
          q.push(jobData);
        });
        conn.release();
        q.resume();
      }
    );
  });
}

async function updateSasUri ({ modelId, fileName }, cb) {
  const blobName = 'model_' + modelId + '/' + fileName;
  const { uri } = generateSasToken(blobName);
  try {
    connPool.getConnection((err, conn) => {
      if (err) console.error(err);
      conn.query(
        `UPDATE images ` +
          `SET image_uri='${uri}', updated_date=NOW() ` +
          `WHERE file_name = '${fileName}'`,
        err => {
          if (err) throw err;
          conn.release();
          cb();
        }
      );
    });
  } catch (err) { 
    console.error(err);
  }
}

function generateSasToken(blobName) {
  const startDate = new Date();
  startDate.setMinutes(startDate.getMinutes() - 5);
  const expiryDate = new Date(startDate);
  expiryDate.setMinutes(startDate.getMinutes() + 525600);
  const permissions = storage.BlobUtilities.SharedAccessPermissions.READ;
  const sharedAccessPolicy = {
    AccessPolicy: {
      Permissions: permissions,
      Start: startDate,
      Expiry: expiryDate
    }
  };
  const sasToken = blobService.generateSharedAccessSignature(
    containerName,
    blobName,
    sharedAccessPolicy
  );
  return {
    token: sasToken,
    uri: blobService.getUrl(containerName, blobName, sasToken, true)
  };
}