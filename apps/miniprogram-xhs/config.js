const environments = {
    "develop": {
        "apiBase": "http://127.0.0.1:8010/api/v1",
        "websiteBase": "http://localhost:3010"
    },
    "trial": {
        "apiBase": "",
        "websiteBase": ""
    },
    "release": {
        "apiBase": "",
        "websiteBase": ""
    }
};
function getConfig() { const config = environments["develop"]; if (!config.apiBase || !config.websiteBase)
    throw new Error('尚未配置小程序服务地址'); return config; }
module.exports = { getConfig, environments };
