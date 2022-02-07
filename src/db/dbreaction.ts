/*
Copyright 2022 cernodile/matrix-appservice-discord

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { DiscordStore } from "../store";
import { IDbData } from "./dbdatainterface";
import { ISqlCommandParameters } from "./connector";

export class DbReaction implements IDbData {
    public EmojiId: string;
    public DiscordMsg: string;
    public DiscordUser: string;
    public EventID: string;
    public Result: boolean;
    private rows: any[];
    
    get ResultCount(): number {
        return this.rows.length;
    }

    public async RunQuery(store: DiscordStore, params: ISqlCommandParameters): Promise<void> {
        this.rows = [];
        let query = `
            SELECT *
            FROM bot_reactions
            WHERE emoji_id = $id AND discord_user = $discord_user AND discord_msg = $discord_msg`;
        const rowsM = await store.db.All(query, {
            id: params.emoji_id,
            discord_user: params.discord_user,
            discord_msg: params.discord_msg,
        });
        for (const rowM of rowsM) {
            this.rows.push({
                /* eslint-disable @typescript-eslint/camelcase */
                event_id: rowM.event_id as string,
                emoji_id: rowM.emoji_id as string,
                discord_msg: rowM.discord_msg as string,
                discord_user: rowM.discord_user as string,
                /* eslint-enable @typescript-eslint/camelcase */
            });
        }
        this.Result = this.rows.length != 0;
    }

    public Next(): boolean {
        if (!this.Result || this.ResultCount === 0) {
            return false;
        }
        const item = this.rows.shift();
        this.EventID = item.event_id;
        this.DiscordMsg = item.discord_msg;
        this.DiscordUser = item.discord_user;
        this.EmojiId = item.emoji_id;
        return true;
    }

    public async Insert(store: DiscordStore): Promise<void> {
        await store.db.Run(`
            INSERT INTO bot_reactions
            (emoji_id,discord_msg,discord_user,event_id)
            VALUES ($emoji_id,$discord_msg,$discord_user,$event_id);`, {
            /* eslint-disable @typescript-eslint/camelcase */
            emoji_id: this.EmojiId,
            discord_msg: this.DiscordMsg,
            discord_user: this.DiscordUser,
            event_id: this.EventID,
            /* eslint-enable @typescript-eslint/camelcase */
        });
    }

    public async Update(store: DiscordStore): Promise<void> {
        throw new Error("Update can not be applied to reactions.");
    }

    public async Delete(store: DiscordStore): Promise<void> {
        await store.db.Run(`
        DELETE FROM bot_reactions
        WHERE event_id = $event_id;`, {
        /* eslint-disable @typescript-eslint/camelcase */
        event_id: this.rows[0].EventID,
        /* eslint-enable @typescript-eslint/camelcase */
        });
    }

    public async DeleteAll(store: DiscordStore): Promise<void> {
        await store.db.Run(`
        DELETE FROM bot_reactions
        WHERE discord_msg = $discord_msg;`, {
        /* eslint-disable @typescript-eslint/camelcase */
        discord_msg: this.DiscordMsg,
        /* eslint-enable @typescript-eslint/camelcase */
        });
    }
}
