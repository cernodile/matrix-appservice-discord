/*
Copyright 2018, 2019 matrix-appservice-discord

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

import * as Discord from "better-discord.js";
import { IMatrixMessage } from "./matrixtypes";
import * as Parser from "node-html-parser";
import { Util } from "./util";
import { DiscordBot } from "./bot";
import { MatrixClient } from "matrix-bot-sdk";
import { DiscordBridgeConfig } from "./config";
import {
    IMatrixMessageParserCallbacks,
    IMatrixMessageParserOpts,
    MatrixMessageParser,
} from "matrix-discord-parser";

const DEFAULT_ROOM_NOTIFY_POWER_LEVEL = 50;

export interface IMatrixMessageProcessorParams {
    displayname?: string;
    mxClient?: MatrixClient;
    roomId?: string;
    userId?: string;
}

export class MatrixMessageProcessor {
    private listBulletPoints: string[] = ["●", "○", "■", "‣"];
    private parser: MatrixMessageParser;
    constructor(public bot: DiscordBot, private config: DiscordBridgeConfig) {
        this.parser = new MatrixMessageParser();
    }

    public async FormatMessage(
        msg: IMatrixMessage,
        channel: Discord.TextChannel,
        params?: IMatrixMessageProcessorParams,
    ): Promise<string> {
        const opts = this.getParserOpts(msg, channel, params);
        return this.parser.FormatMessage(opts, msg);
    }

    private getParserOpts(
        msg: IMatrixMessage,
        channel: Discord.TextChannel,
        params?: IMatrixMessageProcessorParams,
    ): IMatrixMessageParserOpts {
        return {
            callbacks: this.getParserCallbacks(msg, channel, params),
            determineCodeLanguage: this.config.bridge.determineCodeLanguage,
            displayname: params ? params.displayname || "" : "",
        };
    }

    private getParserCallbacks(
        msg: IMatrixMessage,
        channel: Discord.TextChannel,
        params?: IMatrixMessageProcessorParams,
    ): IMatrixMessageParserCallbacks {
        return {
            canNotifyRoom: async () => {
                if (!params || !params.mxClient || !params.roomId || !params.userId) {
                    return false;
                }
                return await Util.CheckMatrixPermission(
                    params.mxClient,
                    params.userId,
                    params.roomId,
                    DEFAULT_ROOM_NOTIFY_POWER_LEVEL,
                    "notifications",
                    "room",
                );
            },
            getChannelId: async (mxid: string) => {
                const CHANNEL_REGEX = /^#_discord_[0-9]*_([0-9]*):/;
                const match = mxid.match(CHANNEL_REGEX);
                if (!(match && channel.guild.channels.resolve(match[1]))) {
                    /*
                    This isn't formatted in #_discord_, so let's fetch the internal room ID
                    and see if it is still a bridged room!
                    */
                    if (params && params.mxClient) {
                        try {
                            const resp = await params.mxClient.lookupRoomAlias(mxid);
                            if (resp && resp.roomId) {
                                const roomId = resp.roomId;
                                const ch = await this.bot.GetChannelFromRoomId(roomId);
                                return ch.id;
                            }
                        } catch (err) { } // ignore, room ID wasn't found
                    }
                    return null;
                }
                return match && match[1] || null;
            },
            getEmoji: async (mxc: string, name: string) => {
                let emoji: {id: string, animated: boolean, name: string} | null = null;
                try {
                    const emojiDb = await this.bot.GetEmojiByMxc(mxc);
                    const id = emojiDb.EmojiId;
                    const canUseExternal = channel.permissionsFor(channel.guild.id)?.has(Discord.Permissions.FLAGS.USE_EXTERNAL_EMOJIS) && await this.bot.getOrCreateWebhook(channel) != null;
                    // Webhook ignores emote requirements - we can safely pass on a emote without proxying it to another site.
                    emoji = canUseExternal ? {id: emojiDb.EmojiId, animated: emojiDb.Animated, name: emojiDb.Name} : channel.guild.emojis.resolve(id);
                } catch (e) {
                    emoji = null;
                }
                if (!emoji) {
                    emoji = channel.guild.emojis.resolve(name);
                }
                return emoji;
            },
            getUserId: async (mxid: string) => {
                const USER_REGEX = /^@_discord_([0-9]*)/;
                const match = mxid.match(USER_REGEX);
                const member = match && await channel.guild.members.fetch(match[1]);
                if (!match || !member) {
                    return null;
                }
                return match[1];
            },
            mxcUrlToHttp: (mxc: string) => {
                if (params && params.mxClient) {
                    return params.mxClient.mxcToHttp(mxc);
                }
                return mxc;
            },
        };
    }
}
