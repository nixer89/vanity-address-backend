import { MongoClient, Collection, Cursor } from 'mongodb';
import consoleStamp = require("console-stamp");
import { AllowedOrigins, ApplicationApiKeys, UserIdCollection, FrontendIdPayloadCollection, XummIdPayloadCollection, XrplAccountPayloadCollection, StatisticsCollection, PurchasedVanityAddresses, SavedSearchTermXummId } from './util/types';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class DB {
    dbIp = process.env.DB_IP || "127.0.0.1"

    allowedOriginsCollection:Collection<AllowedOrigins> = null;
    applicationApiKeysCollection:Collection<ApplicationApiKeys> = null;
    userIdCollection:Collection<UserIdCollection> = null;
    frontendIdPayloadCollection:Collection<FrontendIdPayloadCollection> = null;
    xummIdPayloadCollection:Collection<XummIdPayloadCollection> = null;
    xrplAccountPayloadCollection:Collection<XrplAccountPayloadCollection> = null;
    tmpInfoTable:Collection = null;
    statisticsCollection:Collection<StatisticsCollection> = null;
    purchasedVanityAddressCollection:Collection<PurchasedVanityAddresses> = null;
    savedSearchTermXummIdCollection:Collection<SavedSearchTermXummId> = null;

    allowedOriginCache:AllowedOrigins[] = null;
    applicationApiKeysCache:ApplicationApiKeys[] = null;


    async initDb(from: string): Promise<void> {
        console.log("init mongodb from: " + from);
        this.allowedOriginsCollection = await this.getNewDbModel("AllowedOrigins");
        this.applicationApiKeysCollection = await this.getNewDbModel("ApplicationApiKeys");
        this.userIdCollection = await this.getNewDbModel("UserIdCollection");
        this.xummIdPayloadCollection = await this.getNewDbModel("XummIdPayloadCollection");
        this.xrplAccountPayloadCollection = await this.getNewDbModel("XrplAccountPayloadCollection");
        this.tmpInfoTable = await this.getNewDbModel("TmpInfoTable");
        this.statisticsCollection = await this.getNewDbModel("StatisticsCollection");
        this.purchasedVanityAddressCollection = await this.getNewDbModel("PurchasedVanityAddressCollection");
        this.savedSearchTermXummIdCollection = await this.getNewDbModel("SavedSearchTermXummIdCollection");
        
        return Promise.resolve();
    }

    async saveUser(origin:string, applicationId: string, userId:string, xummId: string): Promise<any> {
        console.log("[DB]: saveUser:" + " origin: " + origin + " userId: " + userId + " xummId: " + xummId);
        try {
            if((await this.userIdCollection.find({origin: origin, applicationId: applicationId, frontendUserId: userId, xummUserId: xummId}).toArray()).length == 0) {
                return this.userIdCollection.insertOne({origin: origin, applicationId: applicationId, frontendUserId: userId, xummUserId: xummId, created: new Date()});
            } else {
                return Promise.resolve();
            }
        } catch(err) {
            console.log("[DB]: error saveUser");
            console.log(JSON.stringify(err));
        }
    }

    async storePayloadForXummId(origin:string, referer:string, applicationId: string, xummUserId:string, payloadId: string, payloadType: string): Promise<any> {
        console.log("[DB]: storePayloadForXummId:" + " origin: " + origin + " referer: " + referer + " xummUserId: " + xummUserId + " payloadId: " + payloadId + " payloadType: " + payloadType);
        try {
            return this.xummIdPayloadCollection.updateOne({origin: origin, referer: referer, applicationId: applicationId, xummUserId: xummUserId}, {
                $addToSet: this.getSetToUpdate(payloadType, payloadId),
                $currentDate: {
                   "updated": { $type: "timestamp" }
                }   
            }, {upsert: true});
        } catch(err) {
            console.log("[DB]: error storePayloadForXummId");
            console.log(JSON.stringify(err));
        }
    }

    async getPayloadIdsByXummIdForApplication(applicationId: string, xummUserId:string, payloadType: string): Promise<string[]> {
        console.log("[DB]: getPayloadIdsByXummIdForApplication: applicationId: " + applicationId +" xummUserId: " + xummUserId);
        try {
            let findResult:XummIdPayloadCollection[] = await this.xummIdPayloadCollection.find({applicationId: applicationId, xummUserId: xummUserId}).toArray();

            if(findResult && findResult.length > 0) {
                let payloadsForUserAndOrigin:string[] = [];
                for(let i = 0; i < findResult.length; i++){
                    payloadsForUserAndOrigin = payloadsForUserAndOrigin.concat(this.getPayloadArrayForType(findResult[i], payloadType));
                }

                return payloadsForUserAndOrigin;
            } else
                return [];

        } catch(err) {
            console.log("[DB]: error getPayloadIdsByXummIdForApplication");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async getPayloadIdsByXummIdForApplicationAndReferer(referer: string, applicationId: string, xummUserId:string, payloadType: string): Promise<string[]> {
        console.log("[DB]: getPayloadIdsByXummIdForApplicationAndReferer: referer: " + referer + " applicationId: " + applicationId + " xummUserId: " + xummUserId);
        try {
            let findResult:XummIdPayloadCollection = await this.xummIdPayloadCollection.findOne({applicationId: applicationId, referer: referer, xummUserId: xummUserId})
            if(findResult)
                return this.getPayloadArrayForType(findResult, payloadType);
            else
                return [];
        } catch(err) {
            console.log("[DB]: error getPayloadIdsByXummIdForApplicationAndReferer");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async storePayloadForXRPLAccount(origin:string, referer:string, applicationId: string, xrplAccount:string, xummId:string, payloadId: string, payloadType: string): Promise<any> {
        console.log("[DB]: storePayloadForXRPLAccount:" + " origin: " + origin + " xrplAccount: " + xrplAccount + " xummId: " + xummId + " payloadId: " + payloadId + " payloadType: " + payloadType);
        try {
            if(!xummId)
                xummId = await this.getXummIdForXRPLAccount(applicationId, xrplAccount);

            return this.xrplAccountPayloadCollection.updateOne({origin: origin, referer: referer, applicationId: applicationId, xrplAccount: xrplAccount}, {
                $set: {
                    xummId: xummId
                },
                $addToSet: this.getSetToUpdate(payloadType, payloadId),
                $currentDate: {
                   "updated": { $type: "timestamp" }
                }                
              }, {upsert: true});
        } catch(err) {
            console.log("[DB]: error storePayloadForXRPLAccount");
            console.log(JSON.stringify(err));
        }
    }

    async getXummIdForXRPLAccount(applicationId: string, xrplAccount:string): Promise<string> {
        console.log("[DB]: getXummIdForXRPLAccount:" + " applicationId: " + applicationId + " xrplAccount: " + xrplAccount);
        try {
            let findResult:XrplAccountPayloadCollection[] = await this.xrplAccountPayloadCollection.find({applicationId: applicationId, xrplAccount: xrplAccount, xummId: { $ne: null}}).sort({updated: -1}).limit(1).toArray();

            if(findResult && findResult[0] && findResult[0].xummId) {
                return findResult[0].xummId;
            } else
                return "";

        } catch(err) {
            console.log("[DB]: error getXummIdForXRPLAccount");
            console.log(JSON.stringify(err));
            return "";
        }
    }

    async getPayloadIdsByXrplAccountForApplicationBySignin(applicationId: string, xrplAccount:string) {
        console.log("[DB]: getPayloadIdsByXrplAccountForApplicationBySignin:" + " applicationId: " + applicationId + " xrplAccount: " + xrplAccount);
        try {
            let findResult:XrplAccountPayloadCollection[] = await this.xrplAccountPayloadCollection.find({applicationId: applicationId, xrplAccount: xrplAccount, signin: {$ne: null}}).sort({updated: 1}).toArray();

            if(findResult && findResult.length > 0) {
                let payloadsForUserAndOrigin:string[] = [];
                for(let i = 0; i < findResult.length; i++){
                    payloadsForUserAndOrigin = payloadsForUserAndOrigin.concat(this.getPayloadArrayForType(findResult[i], 'signin'));
                }

                return payloadsForUserAndOrigin;
            } else
                return [];

        } catch(err) {
            console.log("[DB]: error getPayloadIdsByXrplAccountForApplicationBySignin");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async getPayloadIdsByXrplAccountForApplicationAndType(applicationId: string, xrplAccount:string, payloadType: string): Promise<string[]> {
        console.log("[DB]: getPayloadIdsByXrplAccountForApplicationAndType:" + " applicationId: " + applicationId + " xrplAccount: " + xrplAccount + " payloadType: " + payloadType);
        try {
            let findResult:XrplAccountPayloadCollection[] = await this.xrplAccountPayloadCollection.find({applicationId: applicationId, xrplAccount: xrplAccount}).sort({updated: 1}).toArray();

            if(findResult && findResult.length > 0) {
                let payloadsForUserAndOrigin:string[] = [];
                for(let i = 0; i < findResult.length; i++){
                    payloadsForUserAndOrigin = payloadsForUserAndOrigin.concat(this.getPayloadArrayForType(findResult[i], payloadType));
                }

                return payloadsForUserAndOrigin;
            } else
                return [];

        } catch(err) {
            console.log("[DB]: error getPayloadIdsByXrplAccountForApplicationAndType");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async getPayloadIdsByXrplAccountForApplicationAndReferer(referer:string, applicationId: string, xrplAccount:string, payloadType: string): Promise<string[]> {
        console.log("[DB]: getPayloadIdsByXrplAccountForApplicationAndReferer: referer: " + referer + " applicationId: " + applicationId +" xrplAccount: " + xrplAccount + " payloadType: " + payloadType);
        try {
            let findResult:XrplAccountPayloadCollection = await this.xrplAccountPayloadCollection.findOne({referer:referer, applicationId: applicationId, xrplAccount: xrplAccount});

            if(findResult)
                return this.getPayloadArrayForType(findResult, payloadType);
            else
                return [];
        } catch(err) {
            console.log("[DB]: error getPayloadIdsByXrplAccountForApplicationAndReferer");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async getAllOrigins(): Promise<AllowedOrigins[]> {
        try {
            if(!this.allowedOriginCache) {
                console.log("[DB]: getOrigins from DB");
                this.allowedOriginCache = await this.allowedOriginsCollection.find({}).toArray();
            } else {
                console.log("[DB]: getOrigins from CACHE");
            }
            return this.allowedOriginCache;
        } catch(err) {
            console.log("[DB]: error getOrigins");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async getOriginProperties(applicationId: string): Promise<AllowedOrigins> {
        try {
            if(!this.allowedOriginCache) {
                console.log("[DB]: getOriginProperties from DB:" + " applicationId: " + applicationId);
                this.allowedOriginCache = await this.allowedOriginsCollection.find().toArray();
            } else {
                console.log("[DB]: getOriginProperties from CACHE:" + " applicationId: " + applicationId);
            }
            return this.allowedOriginCache.filter(originProperties => originProperties.applicationId === applicationId)[0];
        } catch(err) {
            console.log("[DB]: error getOriginProperties");
            console.log(JSON.stringify(err));
            return null;
        }
    }

    async getAppIdForOrigin(origin: string): Promise<string> {
        try {
            if(!this.allowedOriginCache) {
                console.log("[DB]: getAppIdForOrigin:" + " origin from DB: " + origin);
                this.allowedOriginCache = await this.allowedOriginsCollection.find().toArray();
            } else {
                console.log("[DB]: getAppIdForOrigin:" + " origin from CACHE: " + origin);
            }

            let searchResult:AllowedOrigins[] = this.allowedOriginCache.filter(originProperties => originProperties.origin.split(',').includes(origin));
            if(searchResult)
                return searchResult[0].applicationId;
            return null;

        } catch(err) {
            console.log("[DB]: error getAppIdForOrigin");
            console.log(JSON.stringify(err));
            return null;
        }
    }

    async getAllowedOriginsAsArray(): Promise<string[]> {
        try {
            if(!this.allowedOriginCache) {
                console.log("[DB]: getAllowedOriginsAsArray from DB");
                this.allowedOriginCache = await this.allowedOriginsCollection.find().toArray();
            } else {
                console.log("[DB]: getAllowedOriginsAsArray from CACHE");
            }

            let allowedOrigins:string[] = [];
            for(let i = 0; i < this.allowedOriginCache.length; i++) {
                if(this.allowedOriginCache[i].origin && this.allowedOriginCache[i].origin.trim().length > 0)
                    allowedOrigins = allowedOrigins.concat(this.allowedOriginCache[i].origin.split(','));
            }

            return allowedOrigins;

        } catch(err) {
            console.log("[DB]: error getAllowedOriginsAsArray");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async getOriginReturnUrl(origin: string, applicationId: string, referer: string, isWeb: boolean): Promise<string> {
        
        try {
            if(!this.allowedOriginCache) {
                console.log("[DB]: getOriginReturnUrl from DB:" + " origin: " + origin + " referer: " + referer + " isWeb: " + isWeb);
                this.allowedOriginCache = await this.allowedOriginsCollection.find().toArray();
            } else {
                console.log("[DB]: getOriginReturnUrl from CACHE:" + " origin: " + origin + " referer: " + referer + " isWeb: " + isWeb);
            }
            
            let searchResult:AllowedOrigins = this.allowedOriginCache.filter(originProperties => originProperties.origin.split(',').includes(origin) && originProperties.applicationId === applicationId)[0];
            if(searchResult && searchResult.return_urls) {
                for(let i = 0; i < searchResult.return_urls.length; i++) {
                    if(searchResult.return_urls[i].from === referer) {
                        if(isWeb)
                            return searchResult.return_urls[i].to_web;
                        else
                            return searchResult.return_urls[i].to_app;
                    }
                }

                return null;
            }
            else
                return null;
        } catch(err) {
            console.log("[DB]: error getOriginReturnUrl");
            console.log(JSON.stringify(err));
            return null;
        }
    }

    async getApiSecretForAppId(appId: string): Promise<string> {
        
        try {
            if(!this.applicationApiKeysCache) {
                console.log("[DB]: getApiSecretForAppId from DB:" + " appId: " + appId);
                this.applicationApiKeysCache = await this.applicationApiKeysCollection.find().toArray();
            } else {
                console.log("[DB]: getApiSecretForAppId from CACHE:" + " appId: " + appId);
            }

            let searchResult:ApplicationApiKeys = this.applicationApiKeysCache.filter(element => element.xumm_app_id === appId)[0];

            if(searchResult && searchResult.xumm_app_secret)
                return searchResult.xumm_app_secret;
            else
                return null;
        } catch(err) {
            console.log("[DB]: error getApiSecretForAppId");
            console.log(JSON.stringify(err));
            return null;
        }
    }

    async saveTempInfo(anyInfo: any): Promise<any> {
        console.log("[DB]: saveTempInfo");
        try {
            anyInfo.created = new Date().toUTCString();
            return this.tmpInfoTable.insertOne(anyInfo);
        } catch(err) {
            console.log("[DB]: error saveTempInfo");
            console.log(JSON.stringify(err));
        }
    }

    async getTempInfo(anyFilter: any): Promise<any> {
        console.log("[DB]: getTempInfo: " + JSON.stringify(anyFilter));
        try {
            return this.tmpInfoTable.findOne(anyFilter);
        } catch(err) {
            console.log("[DB]: error getTempInfo");
            console.log(JSON.stringify(err));
        }
    }

    async getAllTempInfo(): Promise<any[]> {
        console.log("[DB]: getAllTempInfo");
        try {
            return this.tmpInfoTable.find({}).toArray();
        } catch(err) {
            console.log("[DB]: error getAllTempInfo");
            console.log(JSON.stringify(err));
        }
    }

    async deleteTempInfo(anyFilter: any): Promise<any> {
        console.log("[DB]: deleteTempInfo: " + JSON.stringify(anyFilter));
        try {
            return this.tmpInfoTable.deleteOne(anyFilter);
        } catch(err) {
            console.log("[DB]: error deleteTempInfo");
            console.log(JSON.stringify(err));
        }
    }

    async saveTransactionInStatistic(origin:string, appId: string, transactionType: string) {
        console.log("[DB]: saveTransactionInStatistic: [ " +origin + " , "+ appId + " , " + transactionType + " ]");
        try {
            let key = "stats."+transactionType.toLowerCase();
            let toIncrement = {};
            toIncrement[key] = 1;


            return this.statisticsCollection.updateOne({origin: origin, applicationId: appId, type: "transactions"}, {
                $inc: toIncrement,
                $currentDate: {
                   "updated": { $type: "timestamp" }
                }                
              }, {upsert: true});
        } catch(err) {
            console.log("[DB]: error saveTransactionInStatistic");
            console.log(JSON.stringify(err));
        }
    }

    async getTransactions(origin:string, appId: string): Promise<any> {
        console.log("[DB]: getTransactions: [ " + origin + " , "  + appId + " ]");
        try {
            let transactions:any[] = await this.statisticsCollection.find({origin: origin, applicationId: appId, type: "transactions"}).toArray();
            if(transactions && transactions.length >= 1)
                return transactions[0].stats
            else
                return {};
        } catch(err) {
            console.log("[DB]: error getTransactions");
            console.log(JSON.stringify(err));
        }
    }

    async storeVanityPurchase(origin:string, applicationId: string, buyerAccount:string, vanityAccount: string): Promise<void> {
        console.log("[DB]: storeVanityPurchase:" + " origin: " + origin + " buyerAccount: " + buyerAccount + " vanityAccount: " + vanityAccount);
        try {
            await this.purchasedVanityAddressCollection.updateOne({origin: origin, applicationId: applicationId, account: buyerAccount}, {
                $addToSet: {vanityAddresses : vanityAccount},
                $currentDate: {
                   "updated": { $type: "timestamp" }
                }                
              }, {upsert: true});

            return Promise.resolve();
        } catch(err) {
            console.log("[DB]: error storeVanityPurchase");
            console.log(JSON.stringify(err));
        }
    }

    async getPurchasedVanityAddress(account:string): Promise<string[]> {
        console.log("[DB]: getPurchasedVanityAddress");
        try {
            let findResult:PurchasedVanityAddresses[] = await this.purchasedVanityAddressCollection.find({account: account}).toArray();

            if(findResult && findResult.length >=1) {
                return findResult[0].vanityAddresses;
            } else {
                return [];
            }

        } catch(err) {
            console.log("[DB]: error getPurchasedVanityAddress");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async getAllPurchasedVanityAddress(): Promise<string[]> {
        console.log("[DB]: getAllPurchasedVanityAddress");
        try {
            let findResult:PurchasedVanityAddresses[] = await this.purchasedVanityAddressCollection.find({}).toArray();

            //console.log("findResult: " + JSON.stringify(findResult));
            if(findResult && findResult.length > 0) {
                let purchasedAddresses:string[] = [];
                for(let i = 0; i < findResult.length; i++){
                    purchasedAddresses = purchasedAddresses.concat(findResult[i].vanityAddresses);
                }

                return purchasedAddresses;
            } else {
                return [];
            }

        } catch(err) {
            console.log("[DB]: error getAllPurchasedVanityAddress");
            console.log(JSON.stringify(err));
            return [];
        }
    }

    async isVanityAddressAlreadyBought(applicationId: string, vanityAddress:string): Promise<boolean> {
        console.log("[DB]: isVanityAddressAlreadyBought:" + " applicationId: " + applicationId + " vanityAddress: " + vanityAddress);
        try {
            let findResult:PurchasedVanityAddresses[] = await this.purchasedVanityAddressCollection.find({applicationId: applicationId}).toArray();

            //console.log("findResult: " + JSON.stringify(findResult));
            if(findResult && findResult.length > 0) {
                let purchasedAddresses:string[] = [];
                for(let i = 0; i < findResult.length; i++){
                    purchasedAddresses = purchasedAddresses.concat(findResult[i].vanityAddresses);
                }

                return purchasedAddresses.includes(vanityAddress);
            } else {
                return false;
            }

        } catch(err) {
            console.log("[DB]: error isVanityAddressAlreadyBought");
            console.log(JSON.stringify(err));
            return false;
        }
    }

    async saveSearchTermXummId(applicationId: string, searchTerm:string, xummId: string): Promise<any> {
        console.log("[DB]: saveSearchTermXummId:" + " applicationId: " + applicationId + " searchTerm: " + searchTerm + " xummId: " + xummId);
        try {
            if((await this.savedSearchTermXummIdCollection.find({applicationId: applicationId, xummid: xummId, searchterm: searchTerm}).toArray()).length == 0) {
                return this.savedSearchTermXummIdCollection.insertOne({applicationId: applicationId, xummid: xummId, searchterm: searchTerm, created: new Date()});
            } else {
                return Promise.resolve();
            }
        } catch(err) {
            console.log("[DB]: error saveSearchTermXummId");
            console.log(JSON.stringify(err));
        }
    }

    async deleteSearchTermXummId(applicationId: string, searchTerm:string, xummId: string): Promise<any> {
        console.log("[DB]: deleteSearchTermXummId:" + " applicationId: " + applicationId + " searchTerm: " + searchTerm + " xummId: " + xummId);
        try {
            return this.savedSearchTermXummIdCollection.deleteOne({applicationId: applicationId, xummid: xummId, searchterm: searchTerm});
        } catch(err) {
            console.log("[DB]: error deleteSearchTermXummId");
            console.log(JSON.stringify(err));
        }
    }

    getSetToUpdate(payloadType: string, payloadId: string) {
        let payloadTypeLC = ((payloadType && payloadType.trim().length > 0) ? payloadType.trim().toLowerCase() : "others");
        let setToUpdate:any = {};

        setToUpdate[payloadTypeLC] = payloadId;

        return setToUpdate;
    }

    getPayloadArrayForType(dbEntry:any, payloadType: string): string[] {
        let payloadTypeLC = ((payloadType && payloadType.trim().length > 0) ? payloadType.trim().toLowerCase() : "others");

        if(dbEntry[payloadTypeLC])
            return dbEntry[payloadTypeLC];
        else
            return [];
    }

    async getNewDbModel(collectionName: string): Promise<Collection<any>> {
        try {
            console.log("[DB]: connecting to mongo db with collection: " + collectionName +" and an schema");
            let connection:MongoClient = await MongoClient.connect('mongodb://'+this.dbIp+':27017', { useNewUrlParser: true, useUnifiedTopology: true });
            connection.on('error', ()=>{console.log("[DB]: Connection to MongoDB could NOT be established")});
        
            if(connection && connection.isConnected()) {
                let existingCollections:Collection<any>[] = await connection.db('VanityAddress').collections();
                //create collection if not exists
                if(existingCollections.filter(collection => collection.collectionName === collectionName).length == 0)
                    await connection.db('VanityAddress').createCollection(collectionName);

                return connection.db('VanityAddress').collection(collectionName);
            }
            else
                return null;
        } catch(err) {
            console.log(err);
            return null;
        }
    }

    async ensureIndexes(): Promise<void> {
        try {
            console.log("ensureIndexes");
            //AllowedOrigins
            if((await this.allowedOriginsCollection.indexes).length>0)
                await this.allowedOriginsCollection.dropIndexes();

            await this.allowedOriginsCollection.createIndex({origin: -1});
            await this.allowedOriginsCollection.createIndex({applicationId: -1});
            await this.allowedOriginsCollection.createIndex({origin:-1, applicationId: -1}, {unique: true});

            //ApplicationApiKeys
            if((await this.applicationApiKeysCollection.indexes).length>0)
                await this.applicationApiKeysCollection.dropIndexes();

            await this.applicationApiKeysCollection.createIndex({xumm_app_id: -1}, {unique: true});

            //UserIdCollection
            if((await this.userIdCollection.indexes).length>0)
                await this.userIdCollection.dropIndexes();
            
            await this.userIdCollection.createIndex({origin: -1});
            await this.userIdCollection.createIndex({applicationId: -1});
            await this.userIdCollection.createIndex({frontendUserId: -1});
            await this.userIdCollection.createIndex({xummUserId: -1});
            await this.userIdCollection.createIndex({origin: -1, applicationId: -1, frontendUserId: -1 , xummUserId: -1}, {unique: true});

            //FrontendIdPayloadCollection
            if((await this.frontendIdPayloadCollection.indexes).length>0)
                await this.frontendIdPayloadCollection.dropIndexes();

            await this.frontendIdPayloadCollection.createIndex({frontendUserId: -1});
            await this.frontendIdPayloadCollection.createIndex({origin: -1});
            await this.frontendIdPayloadCollection.createIndex({referer: -1});
            await this.frontendIdPayloadCollection.createIndex({applicationId: -1});
            await this.frontendIdPayloadCollection.createIndex({frontendUserId: -1, applicationId: -1, origin:-1, referer: -1}, {unique: true});

            //XummIdPayloadCollection
            if((await this.xummIdPayloadCollection.indexes).length>0)
                await this.xummIdPayloadCollection.dropIndexes();
                
            await this.xummIdPayloadCollection.createIndex({xummUserId: -1});
            await this.xummIdPayloadCollection.createIndex({origin: -1});
            await this.xummIdPayloadCollection.createIndex({referer: -1});
            await this.xummIdPayloadCollection.createIndex({applicationId: -1});
            await this.xummIdPayloadCollection.createIndex({xummUserId: -1, applicationId: -1, origin:-1, referer: -1}, {unique: true});

            //XrplAccountPayloadCollection
            if((await this.xrplAccountPayloadCollection.indexes).length>0)
                await this.xrplAccountPayloadCollection.dropIndexes();
                
            await this.xrplAccountPayloadCollection.createIndex({xrplAccount: -1});
            await this.xrplAccountPayloadCollection.createIndex({origin: -1});
            await this.xrplAccountPayloadCollection.createIndex({referer: -1});
            await this.xrplAccountPayloadCollection.createIndex({applicationId: -1});
            await this.xrplAccountPayloadCollection.createIndex({xrplAccount: -1, applicationId: -1, origin:-1, referer: -1}, {unique: true});

            //purchasedVanityAddressCollection
            if((await this.purchasedVanityAddressCollection.indexes).length>0)
                await this.purchasedVanityAddressCollection.dropIndexes();
                
            await this.purchasedVanityAddressCollection.createIndex({account: -1});
            await this.purchasedVanityAddressCollection.createIndex({applicationId: -1});
            await this.purchasedVanityAddressCollection.createIndex({updated: -1});

            //savedSearchTermXummIdCollection
            if((await this.savedSearchTermXummIdCollection.indexes).length>0)
                await this.savedSearchTermXummIdCollection.dropIndexes();
                
            await this.savedSearchTermXummIdCollection.createIndex({xummid: -1});
            await this.savedSearchTermXummIdCollection.createIndex({applicationId: -1});
            await this.savedSearchTermXummIdCollection.createIndex({searchterm: -1});

        } catch(err) {
            console.log("ERR creating indexes");
            console.log(JSON.stringify(err));
        }
    }

    resetCache() {
        this.applicationApiKeysCache = null;
        this.allowedOriginCache = null;
        console.log("[DB]: CACHE has been reset!");
    }
}