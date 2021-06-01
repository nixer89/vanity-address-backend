import * as config from './util/config'
import HttpsProxyAgent from 'https-proxy-agent';
import * as fetch from 'node-fetch';
import { Prepare, RippleAPI } from 'ripple-lib';
import * as crypto from 'crypto';
import { FormattedSettings } from 'ripple-lib/dist/npm/common/types/objects/settings';
import { TransactionValidation } from './util/types';

export class Vanity {
    private proxy = new HttpsProxyAgent(config.PROXY_URL);
    private useProxy = config.USE_PROXY;

    testData:Map<string, string> = new Map([
        ['rKqazJ6NcY5PMyBRv4u36BUjuLYFUg5gQB','snhLzVdLBHEGbsrRw8ruum9SQnkAU'],
        ['rJQPWL2Xep1qAdg2Fi2n5srEFamKTKi3ji','sn9u4hKEX8Tfbc6ojpcfTHTeDZ8Mr'],
        ['rPMzeN7FET5iAuRCGibyXnsdXgw81MnV3s','ssYPnCMxX3CHwahM8rRf7oT7PJNfm '],
        ['rakr5TMixbetStutc5yf6a1mYcuVoAUjk7','shFD5GK9dCUwFvhRDuopUmd4TrSg2  ']
    ])
    //initialize xrpl connection
    xrplApi = new RippleAPI({server: config.XRPL_SERVER, proxy: config.USE_PROXY ? config.PROXY_URL : null});

    async searchForVanityAddress(searchWord: string): Promise<any> {
        console.log("searchForVanityAddress: " + searchWord);

        let xHash:string = crypto.createHash('sha256').update("search"+searchWord+config.VANITY_BACKEND_SECRET).digest("hex");

        console.log("xHash: " + xHash);

        let returnValue:string[] = [];
        this.testData.forEach((value, key, map) => {
            returnValue.push(key);
        });

        console.log("searchForVanityAddress returning: " + JSON.stringify({
            result: returnValue
        }));

        return {
            result: returnValue
        }
        
        let vanitySearchResponse:fetch.Response = await fetch.default(config.VANITY_API_URL+"search/"+searchWord, {headers: {'x-hash': xHash}, method: "get" , agent: this.useProxy ? this.proxy : null});

        if(vanitySearchResponse && vanitySearchResponse.ok) {
            return vanitySearchResponse.json();
        } else {
            throw "error calling searchForVanityAddress";
        }
    }

    async getSecretForVanityAddress(vanityAccount: string): Promise<any> {
        console.log("getSecretForVanityAddress: " + vanityAccount);

        let xHash:string = crypto.createHash('sha256').update("secret"+vanityAccount+config.VANITY_BACKEND_SECRET).digest("hex");

        console.log("xHash: " + xHash);

        let secret:string = this.testData.get(vanityAccount);

        console.log("getSecretForVanityAddress returning: " + JSON.stringify({
            account: vanityAccount,
            secret: secret
        }
        ));

        return {
            account: vanityAccount,
            secret: secret
        }
        
        let vanitySecretResponse:fetch.Response = await fetch.default(config.VANITY_API_URL+"secret/"+vanityAccount, {headers: {'x-hash': xHash}, method: "get" , agent: this.useProxy ? this.proxy : null});

        if(vanitySecretResponse && vanitySecretResponse.ok) {
            return vanitySecretResponse.json();
        } else {
            throw "error calling getSecretForVanityAddress";
        }
    }

    async purgeVanityAddress(vanityAccount: string): Promise<any> {
        console.log("purgeVanityAddress: " + vanityAccount);
        
        let xHash:string = crypto.createHash('sha256').update("purge"+vanityAccount+config.VANITY_BACKEND_SECRET).digest("hex");

        console.log("xHash: " + xHash);

        console.log("testData before purge: " + JSON.stringify(this.testData));
        this.testData.delete(vanityAccount);
        console.log("testData after purge: " + JSON.stringify(this.testData));

        return "OK";
        

        let vanitySearchResponse:fetch.Response = await fetch.default(config.VANITY_API_URL+"purge/"+vanityAccount, {headers: {'x-hash': xHash}, method: "delete", agent: this.useProxy ? this.proxy : null});

        if(vanitySearchResponse && vanitySearchResponse.ok) {
            return vanitySearchResponse.json();
        } else {
            console.log("NOT OKAY")
            throw "error calling purgeVanityAddress";
        }
    }

    async rekeyVanityAccount(vanityAddress: string, vanitySecret: string, regularKeyAccount: string, retry?: boolean): Promise<TransactionValidation> {
        try {
            console.log("preparing vanity address: " + vanityAddress);

            if(!this.xrplApi.isConnected())
                await this.xrplApi.connect();
            
            let regularKeySettings:FormattedSettings = {
                regularKey: regularKeyAccount,
            }

            let preparedRegularKeySet:Prepare = await this.xrplApi.prepareSettings(vanityAddress, regularKeySettings);

            console.log("finished preparing SetRegularKey: " + JSON.stringify(preparedRegularKeySet));

            console.log("signing SetRegularKey");
            
            let signedRegularKeySet = await this.xrplApi.sign(preparedRegularKeySet.txJSON, vanitySecret);
            
            console.log("finished signing SetRegularKey: " + JSON.stringify(signedRegularKeySet));

            console.log("submitting escrowFinish transaction")
            let result = await this.xrplApi.submit(signedRegularKeySet.signedTransaction);
            console.log("submitting result: " + JSON.stringify(result));
                
            if(!result || "tesSUCCESS" != result.resultCode) {
                if(!retry)
                    return this.rekeyVanityAccount(vanityAddress, vanitySecret, regularKeyAccount, true);
                else
                    return Promise.resolve({success: false, message: ("Account " + vanityAddress + " could not be rekeyed with " + regularKeyAccount), account: regularKeyAccount, testnet: false});
            } else {
                return Promise.resolve({success: true, message: ("Account " + vanityAddress + " rekeyed with: " + regularKeyAccount), txid: signedRegularKeySet.id, account: regularKeyAccount, testnet: false});
            }
        } catch(err) {
            console.log(err);
            return Promise.resolve({success: false, message: ("Account " + vanityAddress + " could not be rekeyed with " + regularKeyAccount), account: regularKeyAccount, testnet: false});
        }
    }

    async disableMasterKey(vanityAddress: string, vanitySecret: string, retry?: boolean): Promise<TransactionValidation> {
        try {
            console.log("preparing vanity address: " + vanityAddress);

            if(!this.xrplApi.isConnected())
                await this.xrplApi.connect();
            
            let disableMasterKeySettings:FormattedSettings = {
                disableMasterKey: true
            }

            let preparedDisableMasterKey:Prepare = await this.xrplApi.prepareSettings(vanityAddress, disableMasterKeySettings);

            console.log("finished preparing AccountSet - disableMasterKey: " + JSON.stringify(preparedDisableMasterKey));

            console.log("signing  AccountSet - disableMasterKey");
            
            let signedDisableMasterKey = await this.xrplApi.sign(preparedDisableMasterKey.txJSON, vanitySecret);
            
            console.log("finished signing  AccountSet - disableMasterKey: " + JSON.stringify(signedDisableMasterKey));

            console.log("submitting  AccountSet - disableMasterKey transaction")
            let result = await this.xrplApi.submit(signedDisableMasterKey.signedTransaction);
            console.log("submitting result: " + JSON.stringify(result));
                
            if(!result || "tesSUCCESS" != result.resultCode) {
                if(!retry)
                    return this.disableMasterKey(vanityAddress, vanitySecret, true);
                else
                    return Promise.resolve({success: false, message: ("Can not disable master key of account: " + vanityAddress), account: null, testnet: false});
            } else {
                return Promise.resolve({success: true, message: ("Master Key disabled for account: " + vanityAddress), txid: signedDisableMasterKey.id , account: null, testnet: false});
            }
        } catch(err) {
            console.log(err);
            return Promise.resolve({success: false, message: ("Can not disable master key of account: " + vanityAddress), account: null, testnet: false});
        }
    }

    async convertUSDtoXRP(usdAmount: number): Promise<string> {
        //read current trustline limit and convert USD value to XRP value + round to one decimal XRP value

        if(!this.xrplApi.isConnected())
            this.xrplApi.connect();

        let usdTrustLine = await this.xrplApi.getTrustlines("rXUMMaPpZqPutoRszR29jtC8amWq3APkx", {currency: "USD"});
        let usdRate:string = usdTrustLine[0].specification.limit;

        let xrpAmount = -1;

        if(usdRate && !Number.isNaN(usdRate))
            xrpAmount = usdAmount * Number(usdRate) * 100;

        xrpAmount = Math.round(xrpAmount) / 100

        return JSON.stringify(xrpAmount * 1000000);
    }
}