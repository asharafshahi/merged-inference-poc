const axios = require('axios');
require('dotenv').load();

class AiTransactions {
  constructor() {
    this.endpoint_url = process.env.AI_TRANSACTIONS_ENDPOINT;
    axios.defaults.headers.common['Content-Type'] = 'application/json';
  }

  async createTransaction({ serviceId, studyUid, accessionNumber }) {
    // console.log(this.endpoint_url);
    const payload = {
      service: {
        id: serviceId
      },
      accessionNumber,
      studyUID: studyUid,
      priority: 1,
      status: 'ANALYSIS_PENDING'
    };
    
    try {
      const { data } = await axios.post(this.endpoint_url, payload);
      return {
        serviceId,
        transactionId: data.id
      };
    } catch (err) {
      console.error(err);
    }
  }
}

module.exports = AiTransactions;
