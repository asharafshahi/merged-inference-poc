FROM node:8.11
RUN apt-get update \
  && apt-get install -y python3-pip python3-dev \
  && cd /usr/local/bin \
  && ln -s /usr/bin/python3 python \
  && pip3 install --upgrade pip
RUN pip install keras
RUN pip install tensorflow
RUN pip install pillow
RUN pip install scikit-image
RUN pip install flask
RUN pip install h5py

WORKDIR /app
COPY . /app
CMD ["python", "app.py"]
EXPOSE 8000
