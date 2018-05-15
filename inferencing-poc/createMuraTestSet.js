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
    studyId,
    imageId,
    description
  } = input;
  try {
    const accessionNum = Math.floor(1000000 + Math.random() * 9000000);
    await exec(`gdcm2vtk ${sourcePath} ${destPath}`);
    await exec(
      `dcmodify -nb -i '(0010,0010)=Anonymous^${patientId}' ` +
        `-i '(0010,0020)=${patientId}' ` +
        `-i '(0008,1030)=${description}' ` +
        `-i '(0008,0050)=${accessionNum}' ` +
        `-i '(0008,0060)=CR' ${destPath}`
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
    .pipe(parse({ delimiter: ',' }))
    .on('data', csvRow => {
      count++;
      const [, setName, description, patientId, studyId, imageId] = csvRow[0].split('/');
      q.push({
        sourcePath: sourceImageRoot + '/' + csvRow[0],
        destPath: destImageRoot + '/' + setName + '_' + description + '_' + 
                  patientId + '_' + studyId + '_' + imageId.split('.')[0] + '.dcm',
        description,
        patientId,
        studyId,
        imageId
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
