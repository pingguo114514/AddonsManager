// LiteLoader-AIDS automatic generated
/// <reference path="c:\LSE/dts/HelperLib-master/src/index.d.ts"/> 

function GetLevelName() {
    if (ll.listPlugins().includes('GMLIB-LegacyRemoteCallApi')) {
        const { Minecraft } = require('./GMLIB-LegacyRemoteCallApi/lib/GMLIB_API-JS');
        return Minecraft.getWorldName();
    }
    return /level-name=(.*)/.exec(file.readFrom('./server.properties'))[1];
}

async function cmdAsync(command) {
    return new Promise((resolve, reject) => {
        system.cmd(command, (exitcode, output) => {
            exitcode === 0 ? resolve(output) : reject({ exitcode, output });
        });
    });
}

async function installAddon(filePath) {
    // 获取文件名和扩展名
    const fileName = filePath.split(/[\\/]/).pop();
    const fileExt = fileName.split('.').pop();

    // 校验文件类型
    if (!['mcpack', 'mcaddon', 'zip'].includes(fileExt)) {
        logger.error(`不支持的文件类型: ${fileName}`);
        return false;
    }

    const addonName = fileName.split('.').slice(0, -1).join('.');
    logger.warn(`正在安装 ${fileName}`);
    const tempPath = `./plugins/AddonsManager/temp/${addonName}`;

    try {
        if (file.exists(tempPath)) file.delete(tempPath);

        await cmdAsync(`7za x "${filePath}" -o"${tempPath}"`);
        const manifest = JSON.parse(file.readFrom(`${tempPath}/manifest.json`));
        const type = manifest.modules[0].type === 'data' ? 'behavior' : 'resource';
        if (listInstalledPacks()[type].map(p => p.uuid).includes(manifest.header.uuid)) {
            logger.warn(`${fileName} 已存在，跳过安装`);
            return false;
        }
        const targetDir = `./worlds/${GetLevelName()}/${type}_packs`;

        if (!file.exists(targetDir)) {
            file.mkdir(targetDir);
        }

        await cmdAsync(`powershell Move-Item -Force -Path "'${tempPath}'" -Destination "'${targetDir}'"`);

        const packsPath = `./worlds/${GetLevelName()}/world_${type}_packs.json`;
        const packsData = file.exists(packsPath) ? JSON.parse(file.readFrom(packsPath)) : [];
        packsData.push({
            pack_id: manifest.header.uuid,
            version: manifest.header.version
        });
        file.writeTo(packsPath, JSON.stringify(packsData, null, 4));

        logger.info(`成功安装${type === 'behavior' ? '行为' : '资源'}包 ${manifest.header.name}`);
        file.delete(filePath);
        return true;
    } catch (error) {
        logger.error(`安装 ${fileName} 时出错：${error.output}`);
        return false;
    }
}

function listInstalledPacks() {
    const levelName = GetLevelName();
    const result = {
        behavior: [],
        resource: []
    };

    const readPacks = (type) => {
        const packs = [];
        const packsDir = `./worlds/${levelName}/${type}_packs`;

        if (file.exists(packsDir)) {
            const dirs = file.getFilesList(packsDir)
                .filter(f => file.checkIsDir(`${packsDir}/${f}`));

            dirs.forEach(dirName => {
                const manifestPath = `${packsDir}/${dirName}/manifest.json`;
                try {
                    const manifest = JSON.parse(file.readFrom(manifestPath));
                    const registeredPath = `./worlds/${levelName}/world_${type}_packs.json`;
                    const registeredPacks = file.exists(registeredPath)
                        ? JSON.parse(file.readFrom(registeredPath))
                        : [];
                    const registeredInfo = registeredPacks.find(p => p.pack_id === manifest.header.uuid);

                    packs.push({
                        uuid: manifest.header.uuid,
                        version: manifest.header.version.join('.') || "未知",
                        name: manifest.header.name,
                        folderName: dirName,
                        description: manifest.header.description || "无描述"
                    });
                } catch (e) {
                    logger.error(`读取${dirName}清单失败: ${e}`);
                    packs.push({
                        uuid: "未知",
                        version: "未知",
                        name: dirName,
                        description: "清单文件缺失或损坏"
                    });
                }
            });
        }
        return packs;
    };

    result.behavior = readPacks('behavior');
    result.resource = readPacks('resource');

    return result;
}

function removeAddon(uuid, type) {
    const levelName = GetLevelName();
    const packsPath = `./worlds/${levelName}/world_${type}_packs.json`;
    const packsDir = `./worlds/${levelName}/${type}_packs`;

    // 获取要删除的包信息
    const allPacks = listInstalledPacks()[type];
    const targetPack = allPacks.find(p => p.uuid === uuid);

    if (!targetPack) {
        logger.error(`找不到 UUID 为 ${uuid} 的${type === 'behavior' ? '行为' : '资源'}包`);
        return false;
    }

    // 更新JSON文件
    const packsData = file.exists(packsPath)
        ? JSON.parse(file.readFrom(packsPath))
        : [];
    const index = packsData.findIndex(p => p.pack_id === uuid);
    if (index === -1) return false;

    packsData.splice(index, 1);
    file.writeTo(packsPath, JSON.stringify(packsData, null, 4));


    const targetDir = `${packsDir}/${targetPack.folderName}`;

    if (file.exists(targetDir)) {
        if (file.delete(targetDir)) {
            logger.info(`已删除${type === 'behavior' ? '行为' : '资源'}包：${targetPack.name}`);
            return true;
        } else {
            logger.error(`删除包时出错：${error}`);
            return false;
        }

    }
    logger.warn(`未找到包目录: ${targetPack.name}`);
    return false;
}

// 事件监听
mc.listen('onServerStarted', async () => {
    if(!file.exists('./plugins/AddonsManager/addons')) file.mkdir('./plugins/AddonsManager/addons');
    const addonFiles = file.getFilesList('./plugins/AddonsManager/addons')
        .filter(f => !file.checkIsDir(f) && ['mcpack', 'mcaddon', 'zip'].includes(f.split('.').pop()));

    for (const f of addonFiles) {
        await installAddon(`./plugins/AddonsManager/addons/${f}`);
    }
    let cmd = mc.newCommand('addons', '管理addon', PermType.Console);
    cmd.setEnum('enumList', ['list']);
    cmd.setEnum('enumAdd', ['Add']);
    cmd.setEnum('enumRemove', ['remove']);
    cmd.mandatory('enumList', ParamType.Enum, 'enumList', 1);
    cmd.mandatory('enumAdd', ParamType.Enum, 'enumAdd', 1);
    cmd.mandatory('enumRemove', ParamType.Enum, 'enumRemove', 1);
    cmd.mandatory('Path', ParamType.RawText);
    cmd.mandatory('uuid', ParamType.String);
    cmd.mandatory('type', ParamType.String);
    cmd.overload(['enumList']);
    cmd.overload(['enumAdd', 'Path']);
    cmd.overload(['enumRemove', 'type', 'uuid']);
    cmd.setCallback((cmd, origin, output, results) => {
        if (results.enumList) {
            let list = listInstalledPacks();
            let out = `当前安装了${list.behavior.length}个行为包，${list.resource.length}个资源包\n`
            out += `\n行为包：\n`;
            out += list.behavior.map(p => `名称:${p.name}\n介绍:${p.description}\n版本:${p.version}\nuuid:${p.uuid}`).join('\n-----------------------\n');
            out += `\n资源包：\n`;
            out += list.resource.map(p => `名称:${p.name}\n介绍:${p.description}\n版本:${p.version}\nuuid:${p.uuid}`).join('\n-----------------------\n');
            output.success(out);
        } else if (results.enumAdd) {
            installAddon(results.Path);
        } else if (results.enumRemove) {
            let uuid = results.uuid;
            switch (results.type) {
                case 'b':
                    removeAddon(uuid, 'behavior');
                    break;
                case 'r':
                    removeAddon(uuid, 'resource');
                    break;
                default:
                    output.error("无效的包类型，请使用 b 或 r");
            }
        }
    });
});