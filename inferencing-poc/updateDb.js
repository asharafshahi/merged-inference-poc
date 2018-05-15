require('dotenv').load();
const mysql = require('mysql');
const fs = require('fs-extra');
const dicom = require('dicom-parser/dist/dicomParser');
const Queue = require('better-queue');

const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
const connPool = mysql.createPool({
  connectionLimit: 125,
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASS,
  database: process.env.MYSQL_DB
});

const sourceImageRoot = process.argv[2];
const modelId = process.argv[3];
console.log(`Processing files in ${sourceImageRoot} for model ${modelId}`);

const fileList = fs.readdirSync(sourceImageRoot);

const getIds = dicomData => {
  const dataSet = dicom.parseDicom(dicomData);
  const studyUid = dataSet.string('x0020000d');
  const accNum = dataSet.string('x00080050');
  return { studyUid, accNum };
};

const readImageAndUpdateDb = async (fileName, cb) => {
  console.log(`Reading ${fileName}`);
  fs.readFile(sourceImageRoot + '/' + fileName, (err, data) => {
    const { studyUid, accNum } = getIds(data);
    connPool.getConnection((err, conn) => {
      if (err) console.error(err);
      console.log(
        `Updating accession number ${accNum} and study UID ${studyUid}`
      );
      conn.query(
        `UPDATE images ` +
          `SET accession_number='${accNum}', study_uid='${studyUid}', model_id=${modelId} ` +
          `WHERE file_name = '${fileName}'`,
        (err, rows, fields) => {
          if (err) throw err;
          conn.release();
          console.log('connection released');
          cb();
        }
      );
    });
  });
};

const q = new Queue(readImageAndUpdateDb, { concurrent: 15 });
q.pause();
fileList.forEach(filePath => q.push(filePath));
q.resume();
console.log(`Starting db updates. ${fileList.length} records to process.`);
