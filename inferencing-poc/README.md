# Inferencing POC

This repo contains various tools needed for the inferencing POC.

Converts a batch of PNG images in a folder to DCM files in another folder. Reads several DICOM header attributes from a CSV file and inserts them in the output DCMs. 

Requires that DCMTK and GDCM be installed and in the system path.

testRun.js implements the actual load generator which dispatches job requests at increasing and then decreasing rates
