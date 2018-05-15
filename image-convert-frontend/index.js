const http = require('http');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs-extra');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const dicom = require('dicom-parser/dist/dicomParser');
const aiMktApi = require('@nuance/ai-marketplace-api');
const concat = require("concat-stream");
require('dotenv').load();

const modelMetadata = [
  {
    modelId: 1,
    imgdir: 'data/images/chest-xray',
    endpoint: process.env.CHEST_XRAY_ENDPOINT,
    key: 'CHEST-XRAY-MODEL-1'
  },
  {
    modelId: 2,
    imgdir: 'data/images/mura',
    endpoint: process.env.MURA_ENDPOINT,
    key: 'MURA-MODEL-1'
  }
];

const hostname = '0.0.0.0';
const port = 3000;
const aiTransactions = new aiMktApi(process.env.AI_TRANSACTIONS_ENDPOINT, 
                                    process.env.AI_TRANSACTIONS_KEY)

const server = http
  .createServer((req, res) => {
    console.log(`REQUEST START: ${req.method} ${req.url}`);
    let body = [];
    req
      .on('data', chunk => {
        body.push(chunk);
      })
      .on('end', async () => {
        try {
          if (req.method.toLowerCase() === 'post') {
            body = Buffer.concat(body).toString();
            const { transactionId, uris, modelId } = JSON.parse(body);
            const model = modelMetadata[modelId - 1];
            let studyFolder, studyUid, imageUid;
            await Promise.all(
              uris.map(async url => {
                const result = await axios.get(url, {
                  responseType: 'arraybuffer'
                });
                ({ studyUid, imageUid } = getUids(result.data));
                studyFolder = `${model.imgdir}/${studyUid}`;
                const outputFilename = `${model.imgdir}/${studyUid}/${imageUid}.dcm`;
                fs.ensureDirSync(studyFolder);
                fs.writeFileSync(outputFilename, result.data);
              }));
            const preProcessDir = `${model.imgdir}/preprocess/${studyUid}`;
            await preProcessToPng(studyFolder, preProcessDir);
            const result = await runModel(preProcessDir, model.endpoint);
            if (!result || result.length === 0) {
              throw new Error('No response received from inferencing backend.');
            } else {
              result.forEach((imgResult, idx) => {
                if (!imgResult || imgResult.status != 200 || !imgResult.data) {
                  throw new Error('Invalid response received from inferencing backend.');
                } else {
                  console.log(`AI MODEL RESULT: ${imgResult.data}`);
                }
              });
              const postProcessedData = postProcessToJson(result);
              const resultId = await aiTransactions.createResult(transactionId, model.key, 'test','FROM_AI_SERVICE');
              await aiTransactions.uploadResultData(transactionId, resultId, postProcessedData);
              await aiTransactions.markTransactionStatusComplete(transactionId);   
            }
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain');
          res.end('Acknowledged\n');
          console.log('REQUEST SUCCEEDED');
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          console.error(`REQUEST ERROR: ${err}`);
        }
      })
  })
  .listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });

const getUids = dicomData => {
  const dataSet = dicom.parseDicom(dicomData);
  const studyUid = dataSet.string('x0020000d');
  const imageUid = dataSet.string('x00080018');
  return { studyUid, imageUid };
};

// This function will be customized/replaced for each model based on needs
const preProcessToPng = async (sourceDir, destDir) => {
  const fileList = fs.readdirSync(sourceDir);
  fs.ensureDirSync(destDir);
  await Promise.all(
    fileList.map(file =>
      exec(`gdcm2vtk ${sourceDir + '/' + file} ${destDir}/${file.substr(0, file.length - 4)}.png`)
    )
  );
  return;
};

const runModel = async (directory, endpoint) => {
  const fileList = fs.readdirSync(directory);
  const url = endpoint;
  return await Promise.all(fileList.map(file => {
    const promise = new Promise((resolve) => {
      const fd = new FormData();
      fd.append("name", file);
      fd.append("file", fs.createReadStream(`${directory + '/' + file}`));
      fd.pipe(concat({ encoding: 'buffer' }, data => resolve({ data, headers: fd.getHeaders() })));
    });
    return promise.then(({ data, headers }) => axios.post(url, data, { headers }));
  }));
};

// This function will be customized/replaced for each model based on needs
const postProcessToJson = allResults =>
  JSON.stringify(
    allResults.reduce(
      (acc, curr) => {
        acc.findings.push(curr.data);
        return acc;
      },
      { findings: [] }
    )
  );
