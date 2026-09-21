const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const fs = require('fs');
const path = require('path');

// ========================================
// 基本設定
// ========================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = '1549040975345885244';

const DATA_FILE = path.join(__dirname, 'players.json');

// ========================================
// RCL 段位
// ========================================

const RANKS = [];

for (let i = 1; i <= 10; i++) {
    RANKS.push(`R${i} Low`);
    RANKS.push(`R${i} Medium`);
    RANKS.push(`R${i} High`);
}

// ========================================
// 資料讀取
// ========================================

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        return {};
    }

    try {
        return JSON.parse(
            fs.readFileSync(DATA_FILE, 'utf8')
        );
    } catch (error) {
        console.error(
            'players.json 讀取失敗：',
            error
        );

        return {};
    }
}

function saveData(data) {
    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

const players = loadData();

// ========================================
// 段位工具
// ========================================

function getRankIndex(rankName) {
    return RANKS.indexOf(rankName);
}

function getBigRank(rankName) {
    if (!rankName) {
        return null;
    }

    const match = rankName.match(/^R(\d+)/);

    if (!match) {
        return null;
    }

    return Number(match[1]);
}

function getCurrentRank(member) {
    for (const rank of RANKS) {
        const role =
            member.guild.roles.cache.find(
                r => r.name === rank
            );

        if (
            role &&
            member.roles.cache.has(role.id)
        ) {
            return rank;
        }
    }

    return null;
}

function getNextRank(rankName) {
    const index =
        getRankIndex(rankName);

    if (
        index === -1 ||
        index >= RANKS.length - 1
    ) {
        return null;
    }

    return RANKS[index + 1];
}

// ========================================
// 分數計算
// ========================================

function calculatePoints(
    playerRank,
    opponentBigRank
) {
    const playerBigRank =
        getBigRank(playerRank);

    if (!playerBigRank) {
        return {
            numerator: 0,
            denominator: 1,
            text: '0'
        };
    }

    const opponentNumber =
        Number(
            opponentBigRank.replace('R', '')
        );

    const difference =
        opponentNumber - playerBigRank;

    // ====================================
    // 對手比自己低
    //
    // R5 vs R4 = 1/3
    // R5 vs R3 = 1/6
    // R5 vs R2 = 1/9
    // R5 vs R1 = 1/12
    // ====================================

    if (difference < 0) {
        const rankDifference =
            Math.abs(difference);

        const denominator =
            rankDifference * 3;

        return {
            numerator: 1,
            denominator: denominator,
            text: `1/${denominator}`
        };
    }

    // ====================================
    // 同大段
    //
    // R5 vs R5 = 1/3
    // ====================================

    if (difference === 0) {
        return {
            numerator: 1,
            denominator: 3,
            text: '1/3'
        };
    }

    // ====================================
    // 對手比自己高
    //
    // R2 vs R3 = 0
    // R2 vs R4 = 1/2
    // R2 vs R5 = 1
    // R2 vs R6 = 1 1/2
    // R2 vs R7 = 2
    // ====================================

    const numerator =
        difference - 1;

    if (numerator <= 0) {
        return {
            numerator: 0,
            denominator: 1,
            text: '0'
        };
    }

    if (numerator % 2 === 0) {
        return {
            numerator: numerator / 2,
            denominator: 1,
            text: `${numerator / 2}`
        };
    }

    return {
        numerator: numerator,
        denominator: 2,
        text:
            `${Math.floor(numerator / 2)} 1/2`
    };
}

// ========================================
// 最大公因數
// ========================================

function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);

    while (b !== 0) {
        const temp = a % b;
        a = b;
        b = temp;
    }

    return a || 1;
}

// ========================================
// 約分
// ========================================

function simplifyFraction(
    numerator,
    denominator
) {
    const divisor =
        gcd(
            numerator,
            denominator
        );

    return {
        numerator:
            numerator / divisor,

        denominator:
            denominator / divisor
    };
}

// ========================================
// 玩家資料
// ========================================

function ensurePlayer(
    userId,
    member
) {
    if (!players[userId]) {
        players[userId] = {
            rank:
                getCurrentRank(member),

            progressNumerator: 0,

            progressDenominator: 1,

            progressComponents: [],

            history: []
        };
    }

    const player =
        players[userId];

    if (
        !Array.isArray(
            player.progressComponents
        )
    ) {
        player.progressComponents = [];
    }

    if (
        !Array.isArray(
            player.history
        )
    ) {
        player.history = [];
    }

    if (
        typeof player.progressNumerator !==
        'number'
    ) {
        player.progressNumerator = 0;
    }

    if (
        typeof player.progressDenominator !==
        'number' ||
        player.progressDenominator === 0
    ) {
        player.progressDenominator = 1;
    }

    return player;
}

// ========================================
// 分數紀錄格式
// ========================================

function normalizeComponent(component) {
    if (
        typeof component !== 'string'
    ) {
        return String(component);
    }

    return component.replace(
        /^\+/,
        ''
    );
}

// ========================================
// 目前進度文字
// ========================================

function getProgressText(player) {
    if (
        !player.progressComponents ||
        player.progressComponents.length === 0
    ) {
        return '0/3';
    }

    const components =
        player.progressComponents.map(
            normalizeComponent
        );

    let result = '';

    for (
        let i = 0;
        i < components.length;
        i++
    ) {
        const component =
            components[i];

        if (i === 0) {
            result =
                component.startsWith('-')
                    ? `- ${component.slice(1)}`
                    : component;

            continue;
        }

        if (
            component.startsWith('-')
        ) {
            result +=
                ` - ${component.slice(1)}`;
        } else {
            result +=
                ` + ${component}`;
        }
    }

    return result;
}

// ========================================
// 加入分數
// ========================================

function addFraction(
    player,
    numerator,
    denominator,
    text
) {
    if (numerator <= 0) {
        return;
    }

    // 每一場分數獨立保存
    player.progressComponents.push(
        text
    );

    const newNumerator =
        player.progressNumerator *
        denominator +
        numerator *
        player.progressDenominator;

    const newDenominator =
        player.progressDenominator *
        denominator;

    const simplified =
        simplifyFraction(
            newNumerator,
            newDenominator
        );

    player.progressNumerator =
        simplified.numerator;

    player.progressDenominator =
        simplified.denominator;
}

// ========================================
// 扣除分數
// ========================================

function subtractFraction(
    player,
    numerator,
    denominator,
    text
) {
    if (numerator <= 0) {
        return;
    }

    const oldNumerator =
        player.progressNumerator;

    const oldDenominator =
        player.progressDenominator;

    const newNumerator =
        oldNumerator *
        denominator -
        numerator *
        oldDenominator;

    const newDenominator =
        oldDenominator *
        denominator;

    if (newNumerator <= 0) {
        player.progressNumerator = 0;
        player.progressDenominator = 1;
    } else {
        const simplified =
            simplifyFraction(
                newNumerator,
                newDenominator
            );

        player.progressNumerator =
            simplified.numerator;

        player.progressDenominator =
            simplified.denominator;
    }

    player.progressComponents.push(
        `-${text}`
    );
}

// ========================================
// 修改 Discord RCL 身分組
// ========================================

async function setRankRole(
    member,
    rankName
) {
    const rolesToRemove = [];

    for (const rank of RANKS) {
        const role =
            member.guild.roles.cache.find(
                r => r.name === rank
            );

        if (
            role &&
            member.roles.cache.has(role.id)
        ) {
            rolesToRemove.push(role);
        }
    }

    const targetRole =
        member.guild.roles.cache.find(
            r => r.name === rankName
        );

    if (!targetRole) {
        throw new Error(
            `找不到身分組：${rankName}`
        );
    }

    for (
        const role of rolesToRemove
    ) {
        if (
            role.id !== targetRole.id
        ) {
            await member.roles.remove(
                role
            );
        }
    }

    if (
        !member.roles.cache.has(
            targetRole.id
        )
    ) {
        await member.roles.add(
            targetRole
        );
    }
}

// ========================================
// 完全移除所有 RCL 身分組
// ========================================

async function removeAllRCLRoles(
    member
) {
    const rolesToRemove = [];

    for (const rank of RANKS) {
        const role =
            member.guild.roles.cache.find(
                r => r.name === rank
            );

        if (
            role &&
            member.roles.cache.has(role.id)
        ) {
            rolesToRemove.push(role);
        }
    }

    for (
        const role of rolesToRemove
    ) {
        await member.roles.remove(
            role
        );
    }

    return rolesToRemove.length;
}

// ========================================
// 升段
// ========================================

async function processPromotion(
    member,
    player
) {
    const promotions = [];

    while (
        player.progressNumerator >=
        player.progressDenominator
    ) {
        const oldRank =
            player.rank;

        const nextRank =
            getNextRank(oldRank);

        // R10 High 已經最高
        if (!nextRank) {
            player.progressNumerator = 0;
            player.progressDenominator = 1;
            player.progressComponents = [];
            break;
        }

        // 扣掉一個完整進度
        player.progressNumerator -=
            player.progressDenominator;

        if (
            player.progressNumerator === 0
        ) {
            player.progressDenominator = 1;
        } else {
            const simplified =
                simplifyFraction(
                    player.progressNumerator,
                    player.progressDenominator
                );

            player.progressNumerator =
                simplified.numerator;

            player.progressDenominator =
                simplified.denominator;
        }

        player.rank =
            nextRank;

        // 升段後重新計算這個小段位的紀錄
        player.progressComponents = [];

        promotions.push({
            oldRank,
            newRank: nextRank
        });

        try {
            await setRankRole(
                member,
                nextRank
            );
        } catch (error) {
            console.error(
                '升段修改身分組失敗：',
                error
            );
        }
    }

    return promotions;
}

// ========================================
// Discord Client
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// ========================================
// Slash Commands
// ========================================

const commands = [

    // /統計
    new SlashCommandBuilder()
        .setName('統計')
        .setDescription(
            '查看並登記 RCL 比賽統計'
        )
        .addUserOption(option =>
            option
                .setName('使用者')
                .setDescription(
                    '選擇玩家'
                )
                .setRequired(true)
        ),

    // /撤回
    new SlashCommandBuilder()
        .setName('撤回')
        .setDescription(
            '撤回玩家最後一場比賽'
        )
        .addUserOption(option =>
            option
                .setName('使用者')
                .setDescription(
                    '選擇玩家'
                )
                .setRequired(true)
        ),

    // /重製
    new SlashCommandBuilder()
        .setName('重製')
        .setDescription(
            '完全清除玩家 RCL 戰績並移除全部 RCL 身分組'
        )
        .addUserOption(option =>
            option
                .setName('使用者')
                .setDescription(
                    '選擇玩家'
                )
                .setRequired(true)
        )

].map(command =>
    command.toJSON()
);

// ========================================
// Bot 上線
// ========================================

client.once(
    'ready',
    async () => {

        console.log(
            `登入為 ${client.user.tag}`
        );

        const rest =
            new REST({
                version: '10'
            }).setToken(TOKEN);

        try {

            console.log(
                '正在註冊 /統計 /撤回 /重製...'
            );

            await rest.put(
                Routes.applicationGuildCommands(
                    CLIENT_ID,
                    GUILD_ID
                ),
                {
                    body: commands
                }
            );

            console.log(
                '/統計、/撤回、/重製 註冊成功！'
            );

            console.log(
                'Coco Bot 已上線！'
            );

        } catch (error) {

            console.error(
                'Slash Command 註冊失敗：',
                error
            );
        }
    }
);

// ========================================
// Interaction
// ========================================

client.on(
    'interactionCreate',
    async interaction => {

        try {

            // ====================================
            // /統計
            // ====================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === '統計'
            ) {

                if (
                    !interaction.memberPermissions ||
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {

                    return interaction.reply({
                        content:
                            '❌ 你沒有權限使用 Coco Bot。',
                        ephemeral: true
                    });
                }

                const target =
                    interaction.options.getMember(
                        '使用者'
                    );

                if (!target) {

                    return interaction.reply({
                        content:
                            '❌ 找不到這個玩家。',
                        ephemeral: true
                    });
                }

                // 開始統計時讀取一次目前段位
                const currentRank =
                    getCurrentRank(target);

                if (!currentRank) {

                    return interaction.reply({
                        content:
                            '❌ 這個玩家目前沒有 RCL 段位身分組。\n\n請先手動給他一個 RCL 身分組，例如 `R5 Low`。',
                        ephemeral: true
                    });
                }

                await interaction.deferReply();

                const player =
                    ensurePlayer(
                        target.id,
                        target
                    );

                player.rank =
                    currentRank;

                saveData(players);

                const options = [];

                for (
                    let i = 1;
                    i <= 10;
                    i++
                ) {

                    options.push({
                        label: `R${i}`,
                        value: `R${i}`,
                        description:
                            `對手是 R${i}`
                    });
                }

                const encodedRank =
                    encodeURIComponent(
                        currentRank
                    );

                const menu =
                    new StringSelectMenuBuilder()
                        .setCustomId(
                            `rcl_opponent:${interaction.user.id}:${target.id}:${encodedRank}`
                        )
                        .setPlaceholder(
                            '選擇對手段位'
                        )
                        .addOptions(
                            options
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            menu
                        );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📊 RCL 比賽統計'
                        )
                        .setDescription(
                            `玩家：${target.user.username}\n` +
                            `目前段位：**${currentRank}**\n\n` +
                            `請選擇對手的大段位。`
                        );

                return interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
            }

            // ====================================
            // /撤回
            // ====================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === '撤回'
            ) {

                if (
                    !interaction.memberPermissions ||
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {

                    return interaction.reply({
                        content:
                            '❌ 你沒有權限使用 Coco Bot。',
                        ephemeral: true
                    });
                }

                const target =
                    interaction.options.getMember(
                        '使用者'
                    );

                if (!target) {

                    return interaction.reply({
                        content:
                            '❌ 找不到這個玩家。',
                        ephemeral: true
                    });
                }

                const player =
                    players[target.id];

                if (
                    !player ||
                    !Array.isArray(
                        player.history
                    ) ||
                    player.history.length === 0
                ) {

                    return interaction.reply({
                        content:
                            '❌ 這個玩家沒有可以撤回的比賽紀錄。',
                        ephemeral: true
                    });
                }

                await interaction.deferReply();

                const lastIndex =
                    player.history.length - 1;

                const lastMatch =
                    player.history[lastIndex];

                const restoreRank =
                    lastMatch.rankBefore;

                const restoreNumerator =
                    typeof lastMatch.progressBeforeNumerator ===
                    'number'
                        ? lastMatch.progressBeforeNumerator
                        : 0;

                const restoreDenominator =
                    typeof lastMatch.progressBeforeDenominator ===
                    'number'
                        ? lastMatch.progressBeforeDenominator
                        : 1;

                const restoreComponents =
                    Array.isArray(
                        lastMatch.progressBeforeComponents
                    )
                        ? [
                            ...lastMatch.progressBeforeComponents
                        ]
                        : [];

                try {

                    await setRankRole(
                        target,
                        restoreRank
                    );

                } catch (error) {

                    console.error(
                        '撤回修改身分組失敗：',
                        error
                    );

                    return interaction.editReply({
                        content:
                            '❌ 撤回失敗：Bot 無法修改身分組。\n\n請確認：\n1. Coco Bot 有「管理身分組」\n2. Coco Bot 的身分組在所有 RCL 身分組上方\n3. RCL 身分組名稱沒有打錯'
                    });
                }

                player.rank =
                    restoreRank;

                player.progressNumerator =
                    restoreNumerator;

                player.progressDenominator =
                    restoreDenominator;

                player.progressComponents =
                    restoreComponents;

                player.history.pop();

                saveData(players);

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '↩️ RCL 比賽已撤回'
                        )
                        .addFields({

                            name: '玩家',

                            value:
                                target.user.username,

                            inline: true

                        }, {

                            name: '撤回的比賽',

                            value:
                                `${lastMatch.result === 'win'
                                    ? '✅ 勝利'
                                    : '❌ 失敗'} ` +
                                `vs ${lastMatch.opponentRank}\n` +
                                `分數：${lastMatch.pointsText}`,

                            inline: true

                        }, {

                            name: '恢復段位',

                            value:
                                player.rank,

                            inline: true

                        }, {

                            name: '恢復進度',

                            value:
                                getProgressText(
                                    player
                                ),

                            inline: false

                        })
                        .setFooter({
                            text:
                                `Coco Bot ・ 剩餘 ${player.history.length} 場紀錄`
                        });

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            // ====================================
            // /重製
            // ====================================

            if (
                interaction.isChatInputCommand() &&
                interaction.commandName === '重製'
            ) {

                if (
                    !interaction.memberPermissions ||
                    !interaction.memberPermissions.has(
                        PermissionFlagsBits.Administrator
                    )
                ) {

                    return interaction.reply({
                        content:
                            '❌ 你沒有權限使用 Coco Bot。',
                        ephemeral: true
                    });
                }

                const target =
                    interaction.options.getMember(
                        '使用者'
                    );

                if (!target) {

                    return interaction.reply({
                        content:
                            '❌ 找不到這個玩家。',
                        ephemeral: true
                    });
                }

                await interaction.deferReply();

                let removedCount = 0;

                try {

                    removedCount =
                        await removeAllRCLRoles(
                            target
                        );

                } catch (error) {

                    console.error(
                        '重製移除 RCL 身分組失敗：',
                        error
                    );

                    return interaction.editReply({
                        content:
                            '❌ 重製失敗：Bot 無法移除 RCL 身分組。\n\n請確認：\n1. Coco Bot 有「管理身分組」\n2. Coco Bot 的身分組在所有 RCL 身分組上方\n3. RCL 身分組名稱正確'
                    });
                }

                // 完全刪除玩家資料
                delete players[target.id];

                saveData(players);

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '🗑️ RCL 資料已完全重製'
                        )
                        .setDescription(
                            `玩家：${target.user.username}\n\n` +
                            `這名玩家的 RCL 資料已經全部清除。`
                        )
                        .addFields({

                            name: 'RCL 身分組',

                            value:
                                `已移除 ${removedCount} 個`,

                            inline: true

                        }, {

                            name: '對戰紀錄',

                            value:
                                '已全部清除',

                            inline: true

                        }, {

                            name: '分數與進度',

                            value:
                                '已全部清除',

                            inline: true

                        }, {

                            name: '撤回紀錄',

                            value:
                                '已全部清除',

                            inline: true

                        }, {

                            name: '目前 RCL 段位',

                            value:
                                '無',

                            inline: true

                        })
                        .setFooter({
                            text:
                                'Coco Bot ・ 玩家已完全重置為未參加 RCL'
                        });

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            // ====================================
            // 選擇對手
            // ====================================

            if (
                interaction.isStringSelectMenu() &&
                interaction.customId.startsWith(
                    'rcl_opponent:'
                )
            ) {

                const parts =
                    interaction.customId.split(':');

                const invokerId =
                    parts[1];

                const targetId =
                    parts[2];

                const encodedRank =
                    parts[3];

                const playerRank =
                    decodeURIComponent(
                        encodedRank
                    );

                if (
                    interaction.user.id !==
                    invokerId
                ) {

                    return interaction.reply({
                        content:
                            '❌ 這個統計選單不是你的。',
                        ephemeral: true
                    });
                }

                await interaction.deferUpdate();

                const opponentBigRank =
                    interaction.values[0];

                const target =
                    await interaction.guild.members.fetch(
                        targetId
                    );

                const winButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `rcl_result:win:${invokerId}:${targetId}:${encodeURIComponent(playerRank)}:${opponentBigRank}`
                        )
                        .setLabel('勝利')
                        .setEmoji('✅')
                        .setStyle(
                            ButtonStyle.Success
                        );

                const loseButton =
                    new ButtonBuilder()
                        .setCustomId(
                            `rcl_result:lose:${invokerId}:${targetId}:${encodeURIComponent(playerRank)}:${opponentBigRank}`
                        )
                        .setLabel('失敗')
                        .setEmoji('❌')
                        .setStyle(
                            ButtonStyle.Danger
                        );

                const row =
                    new ActionRowBuilder()
                        .addComponents(
                            winButton,
                            loseButton
                        );

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📊 RCL 比賽統計'
                        )
                        .setDescription(
                            `玩家：${target.user.username}\n` +
                            `玩家段位：**${playerRank}**\n` +
                            `對手段位：**${opponentBigRank}**\n\n` +
                            `請選擇比賽結果。`
                        );

                return interaction.editReply({
                    embeds: [embed],
                    components: [row]
                });
            }

            // ====================================
            // 勝利 / 失敗
            // ====================================

            if (
                interaction.isButton() &&
                interaction.customId.startsWith(
                    'rcl_result:'
                )
            ) {

                const parts =
                    interaction.customId.split(':');

                const result =
                    parts[1];

                const invokerId =
                    parts[2];

                const targetId =
                    parts[3];

                const playerRank =
                    decodeURIComponent(
                        parts[4]
                    );

                const opponentBigRank =
                    parts[5];

                if (
                    interaction.user.id !==
                    invokerId
                ) {

                    return interaction.reply({
                        content:
                            '❌ 這個統計按鈕不是你的。',
                        ephemeral: true
                    });
                }

                await interaction.deferUpdate();

                const target =
                    await interaction.guild.members.fetch(
                        targetId
                    );

                const player =
                    ensurePlayer(
                        targetId,
                        target
                    );

                // 使用開始比賽時的段位
                player.rank =
                    playerRank;

                // ==================================
                // 保存比賽前資料
                // ==================================

                const rankBefore =
                    player.rank;

                const progressBeforeNumerator =
                    player.progressNumerator;

                const progressBeforeDenominator =
                    player.progressDenominator;

                const progressBeforeComponents =
                    [
                        ...player.progressComponents
                    ];

                // ==================================
                // 計算分數
                // ==================================

                const points =
                    calculatePoints(
                        playerRank,
                        opponentBigRank
                    );

                console.log(
                    `[統計] ${playerRank} vs ${opponentBigRank} → ${result} → ${points.text}`
                );

                // ==================================
                // 勝利
                // ==================================

                if (
                    result === 'win'
                ) {

                    addFraction(
                        player,
                        points.numerator,
                        points.denominator,
                        points.text
                    );
                }

                // ==================================
                // 失敗
                // ==================================

                if (
                    result === 'lose'
                ) {

                    subtractFraction(
                        player,
                        points.numerator,
                        points.denominator,
                        points.text
                    );
                }

                // ==================================
                // 升段
                // ==================================

                let promotions = [];

                if (
                    result === 'win'
                ) {

                    promotions =
                        await processPromotion(
                            target,
                            player
                        );
                }

                // ==================================
                // 保存歷史
                // ==================================

                player.history.push({

                    time:
                        new Date().toISOString(),

                    rankBefore,

                    opponentRank:
                        opponentBigRank,

                    result,

                    pointsText:
                        result === 'win'
                            ? `+${points.text}`
                            : `-${points.text}`,

                    pointsNumerator:
                        points.numerator,

                    pointsDenominator:
                        points.denominator,

                    progressBeforeNumerator,

                    progressBeforeDenominator,

                    progressBeforeComponents,

                    rankAfter:
                        player.rank,

                    promotions
                });

                saveData(players);

                // ==================================
                // 建立統計 Embed
                // ==================================

                const embed =
                    new EmbedBuilder()
                        .setTitle(
                            '📊 RCL 統計'
                        )
                        .setDescription(
                            `玩家：${target.user}\n` +
                            `目前段位：**${player.rank}**`
                        );

                // ==================================
                // 本段分數紀錄
                // ==================================

                embed.addFields({

                    name:
                        '本段分數紀錄',

                    value:
                        getProgressText(
                            player
                        ),

                    inline: false
                });

                // ==================================
                // 實際目前進度
                // ==================================

                embed.addFields({

                    name:
                        '目前進度',

                    value:
                        `${player.progressNumerator}/${player.progressDenominator}` +
                        `（滿 1 晉升一小段）`,

                    inline: false
                });

                // ==================================
                // 本場分數
                // ==================================

                embed.addFields({

                    name:
                        '本場結果',

                    value:
                        result === 'win'
                            ? `✅ 勝利\n+${points.text}`
                            : `❌ 失敗\n-${points.text}`,

                    inline: false
                });

                // ==================================
                // 升段
                // ====================================

                if (
                    promotions.length > 0
                ) {

                    const promotionText =
                        promotions
                            .map(
                                p =>
                                    `🏆 ${p.oldRank} → **${p.newRank}**`
                            )
                            .join('\n');

                    embed.addFields({

                        name:
                            '🎉 升段',

                        value:
                            promotionText,

                        inline: false
                    });
                }

                // ==================================
                // 完整比賽紀錄
                // ==================================

                if (
                    player.history.length > 0
                ) {

                    let currentText = '';

                    let fieldNumber = 1;

                    for (
                        let i = 0;
                        i < player.history.length;
                        i++
                    ) {

                        const match =
                            player.history[i];

                        const icon =
                            match.result === 'win'
                                ? '✅'
                                : '❌';

                        const line =
                            `**${i + 1}.** ` +
                            `${icon} ` +
                            `vs ${match.opponentRank} ` +
                            `${match.pointsText}\n`;

                        if (
                            currentText.length +
                            line.length >
                            1000
                        ) {

                            embed.addFields({

                                name:
                                    fieldNumber === 1
                                        ? '比賽紀錄'
                                        : `比賽紀錄 ${fieldNumber}`,

                                value:
                                    currentText,

                                inline: false
                            });

                            fieldNumber++;

                            currentText = '';
                        }

                        currentText += line;
                    }

                    if (
                        currentText.length > 0
                    ) {

                        embed.addFields({

                            name:
                                fieldNumber === 1
                                    ? '比賽紀錄'
                                    : `比賽紀錄 ${fieldNumber}`,

                            value:
                                currentText,

                            inline: false
                        });
                    }
                }

                embed.setFooter({

                    text:
                        `Coco Bot ・ 共 ${player.history.length} 場紀錄`
                });

                return interaction.editReply({

                    embeds: [embed],

                    components: []
                });
            }

        } catch (error) {

            console.error(
                'Interaction 發生錯誤：',
                error
            );

            try {

                if (
                    interaction.deferred
                ) {

                    await interaction.editReply({

                        content:
                            '❌ Coco Bot 發生錯誤，請查看 CMD 的錯誤訊息。',

                        embeds: [],

                        components: []
                    });

                } else if (
                    !interaction.replied
                ) {

                    await interaction.reply({

                        content:
                            '❌ Coco Bot 發生錯誤，請查看 CMD 的錯誤訊息。',

                        ephemeral: true
                    });
                }

            } catch (replyError) {

                console.error(
                    '錯誤訊息也無法送出：',
                    replyError
                );
            }
        }
    }
);

// ========================================
// 啟動 Bot
// ========================================

client.login(TOKEN);