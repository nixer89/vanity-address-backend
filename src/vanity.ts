import * as config from './util/config'
import * as HttpsProxyAgent from 'https-proxy-agent';
import * as fetch from 'node-fetch';
import * as crypto from 'crypto';

export class Vanity {
    private proxy = new HttpsProxyAgent(config.PROXY_URL);
    private useProxy = config.USE_PROXY;

    async searchForVanityAddress(searchWord: string): Promise<any> {
        console.log("searchForVanityAddress: " + searchWord);

        let xHash:string = crypto.createHash('sha256').update("search"+searchWord+config.VANITY_BACKEND_SECRET).digest("hex");
        
        let vanitySearchResponse:fetch.Response = await fetch.default(config.VANITY_API_URL+"search/"+searchWord, {headers: {'x-hash': xHash}, method: "get" , agent: this.useProxy ? this.proxy : null});

        if(vanitySearchResponse && vanitySearchResponse.ok) {
            return vanitySearchResponse.json();
        } else {
            throw "error calling searchForVanityAddress";
        }
    }

    async purgeVanityAddress(xrplAddress: string): Promise<any> {
        console.log("purgeVanityAddress: " + xrplAddress);
        
        let xHash:string = crypto.createHash('sha256').update("purge"+xrplAddress+config.VANITY_BACKEND_SECRET).digest("hex");
        let vanitySearchResponse:fetch.Response = await fetch.default(config.VANITY_API_URL+"purge/"+xrplAddress, {headers: {'x-hash': xHash}, method: "delete", agent: this.useProxy ? this.proxy : null});

        if(vanitySearchResponse && vanitySearchResponse.ok) {
            return vanitySearchResponse.json();
        } else {
            console.log("NOT OKAY")
            throw "error calling purgeVanityAddress";
        }
    }
}