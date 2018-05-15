# NUANCE-JOSHMODS

This repo contains various mods I've made to Arman's core inferencing code. Most of the work was to separate the image conversion frontend logic from the inferencing backend logic, so they can be packaged in separate containers and run in separate pods/deployments in k8s.

## inferencing-poc

This is the client-side driver app. No need to containerize, you can run it using 'node ./testRun.js'. You can configure the load by modifying values in config.js to change test duration, peak load, etc.

## image-convert-frontend

This is the Node HTTP server that accepts inferencing requests and performs this basic logic:

    a. accepts inferencing requests
    b. pulls down DICOMs for each request
    c. converts DICOMs to PNGs
    d. dispatches inferencing request to appropriate internal model endpoint
    e. updates transaction metadata from inferencing response
    f.  returns inferencing response to original caller (load generator)

## chest-xray-model-backend

Python internal HTTP endpoint that accepts inferencing requests of type 'chest-xray' from the frontend.

## mura-model-backend

Python internal HTTP endpoint that accepts inferencing requests of type 'mura' from the frontend.

## steps to run

    1. build container for image-convert-frontend and push to public repo
    1. build container for chest-xray-model-backend and push to public repo
    1. build container for mura-model-backend and push to public repo
    1. update [gcs.yaml](gcs.yaml) to use the container images you just built
    1. update [gcs.yaml](gcs.yaml) to use a named public IP for the ingress
    1. update [gcs.yaml](gcs.yaml) with any autoscale or resource requests/limits as desired
    1. update the MODEL_ENDPOINT env var in [inferencing-poc/.env](inferencing-poc/.env) to use the public IP for the GCE frontend
    1. run 'node ./testRun.js' from inferencing-poc (might have to npm install first)"# merged-inference-poc" 
