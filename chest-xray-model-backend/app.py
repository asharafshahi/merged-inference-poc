import numpy as np
from flask import Flask, jsonify, request
import os
from configparser import ConfigParser
from models.keras import ModelFactory
import time
import statistics
import argparse
from PIL import Image
from skimage.transform import resize

global model

# parser config
config_file = "./config.ini"
cp = ConfigParser()
cp.read(config_file)

# default config
output_dir = cp["DEFAULT"].get("output_dir")
base_model_name = cp["DEFAULT"].get("base_model_name")
class_names = cp["DEFAULT"].get("class_names").split(",")
image_source_dir = cp["DEFAULT"].get("image_source_dir")

# parse weights file path
output_weights_name = cp["TRAIN"].get("output_weights_name")

print(output_weights_name)
best_weights_path = os.path.join(output_dir, "best_weights.h5")

print("** load model **")
model_weights_path = best_weights_path

model_factory = ModelFactory()
model = model_factory.get_model(
    class_names,
    model_name=base_model_name,
    use_base_weights=False,
    weights_path=model_weights_path)

model._make_predict_function()

app = Flask(__name__)

@app.route('/alive', methods = ['GET'])
def alive():
    return 'Ok'

@app.route('/ready', methods = ['GET'])
def ready():
    return 'Ok'

@app.route('/score', methods = ['POST'])
def score_image():
    img = request.files['file']
    image = Image.open(img) 
    image_array = np.asarray(image.convert("RGB"))
    image_array = image_array / 255.
    image_array = resize(image_array, [224,224])
    image_array = np.expand_dims(image_array, axis=0)

    print("** make prediction **")
    y_hat = model.predict(image_array, 1)
    prediction = class_names[np.argmax(y_hat)]

    print("Model score for image is: {}".format(y_hat))
    print("Highest probability is: {}".format(prediction))

    return jsonify(prediction)

if __name__ == "__main__":    
    app.run(port=8000,host='0.0.0.0')
