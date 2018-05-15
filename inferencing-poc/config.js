module.exports = {
  name: 'testRun-1',
  environment: 'Google',
  jobs: [
    {
      modelId: 1,
      duration: 1,
      peakLoad: 1000,
      serviceId: 1,
      modelToken: 'token123'
    },
    {
      modelId: 2,
      duration: 1,
      peakLoad: 500,
      serviceId: 3,
      modelToken: 'token123'
    }
  ]
};
