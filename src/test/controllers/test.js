const Test = require('../models/test');

module.exports = {
    test: async () => {
        try {
            const result = await Test.test();
            
            if (result.message) {
                process.exit(1)
            }
        } catch (error) {
            console.error(error);
            process.exit(0)
        }
    }
}