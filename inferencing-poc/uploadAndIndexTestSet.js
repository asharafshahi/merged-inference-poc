require('dotenv').load();
const azure = require('azure');
const storage = require('azure-storage');
const mysql = require('mysql');
const Queue = require('better-queue');
const fs = require('fs-extra');

const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
const blobService = storage.createBlobService();
const connPool = mysql.createPool({
  connectionLimit: 25,
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB
});

const modelId = process.argv[2];
const sourceImageRoot = process.argv[3];
if (modelId === undefined || sourceImageRoot === undefined) {
  console.log('Usage: uploadAndIndexTestSet.js <model ID> <sourceImageRoot>');
  process.exit();
}

if (!fs.existsSync(sourceImageRoot)) {
  console.log('Source image root folder does not exist');
  process.exit();
}
const fileList = fs.readdirSync(sourceImageRoot);

const uploadAndIndexImage = async (imgPath, cb) => {
  try {
    const uri = await uploadImageToBlobStorage(
      sourceImageRoot + '/' + imgPath,
      'model_' + modelId + '/' + imgPath
    );
    connPool.getConnection((err, conn) => {
      if (err) console.error(err);
      let studyId;
      conn.query(
        `INSERT INTO studies SET ?`,
        { model_id: modelId },
        (err, res) => {
          if (err) throw err;
          studyId = res.insertId;
          conn.query(
            `INSERT INTO images SET ?`,
            { study_id: studyId, image_uri: uri, file_name: imgPath },
            (err, res) => {
              conn.release();
              if (err) console.error(err);
              cb();
            }
          );
        }
      );
    });
  } catch (err) {
    console.error(err);
  }
};

async function uploadImageToBlobStorage(sourcePath, destBlobName) {
  return new Promise((resolve, reject) => {
    blobService.createBlockBlobFromLocalFile(
      containerName,
      destBlobName,
      sourcePath,
      err => {
        if (err) {
          reject(err);
        } else {
          const { uri } = generateSasToken(destBlobName);
          console.log(uri);
          resolve(uri);
        }
      }
    );
  });
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

const q = new Queue(uploadAndIndexImage, { concurrent: 15 });
q.pause();
fileList.forEach(filePath => q.push(filePath));
q.resume();
