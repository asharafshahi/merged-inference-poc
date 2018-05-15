const util = require('util');
const exec = util.promisify(require('child_process').exec);
const Queue = require('better-queue');
const parse = require('csv-parse');
const fs = require('fs-extra');

const csvFile = process.argv[4];
const destImageRoot = process.argv[3];
const sourceImageRoot = process.argv[2];

if (!(fs.existsSync(csvFile) && fs.existsSync(sourceImageRoot))) {
  console.log('Usage: index.js <sourceImageRoot> <destImageRoot> <csvFile>');
  process.exit();
}

fs.ensureDirSync(destImageRoot);

const convertImage = async (input, cb) => {
  const {
    sourcePath,
    destPath,
    patientId,
    age,
    origPixX,
    origPixY,
    description,
    gender,
    viewPos,
    origWidth,
    origHeight
  } = input;
  try {
    const accessionNum = Math.floor(1000000 + Math.random() * 9000000);
    const studyCmt =
      origWidth + ',' + origHeight + ',' + origPixX + ',' + origPixY;
    await exec(`gdcm2vtk ${sourcePath} ${destPath}`);
    await exec(
      `dcmodify -nb -i '(0010,0010)=Anonymous^${patientId}' ` +
        `-i '(0010,0020)=${patientId}' -i '(0010,0040)=${gender}' ` +
        `-i '(0010,1010)=${age}' -i '(0008,1030)=${description}' ` +
        `-i '(0008,0050)=${accessionNum}' -i '(0018,5101)=${viewPos}' ` +
        `-i '(0032,4000)=${studyCmt}' -i '(0008,0060)=CR' ${destPath}`
    );
    console.log(`completed image conversion for ${sourcePath}`);
    cb();
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const q = new Queue(convertImage, {
  // store: {
  //  type: 'sql',
  //  dialect: 'sqlite',
  //  path: 'queuefile'
  // },
  concurrent: 15
});

q.pause();

const stats = q.getStats();
console.log(stats);

if (stats.total === 0) {
  // brand new job
  let count = 0;
  const readStream = fs.createReadStream(csvFile);
  readStream
    .pipe(parse({ delimiter: ',', from: 10001 }))
    .on('data', csvRow => {
      count++;
      q.push({
        sourcePath: sourceImageRoot + '/' + csvRow[0],
        destPath: destImageRoot + '/' + csvRow[0].split('.')[0] + '.dcm',
        description: csvRow[1],
        patientId: csvRow[3],
        age: csvRow[4],
        gender: csvRow[5],
        viewPos: csvRow[6],
        origWidth: csvRow[7],
        origHeight: csvRow[8],
        origPixX: csvRow[9],
        origPixY: csvRow[10]
      });
    })
    .on('end', () => {
      console.log(`All CSV entires added to queue, count: ${count}`);
      const stats = q.getStats();
      console.log(stats);
      q.resume();
    })
    .on('close', err => {
      console.log('Stream was destroyed, file closed');
    });
}
