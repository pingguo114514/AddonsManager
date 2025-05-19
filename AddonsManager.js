// LiteLoader-AIDS automatic generated
/// <reference path="c:\LSE/dts/HelperLib-master/src/index.d.ts"/> 
const path = require('path');
const fs = require('fs');
const JSON5 = require('json5');
const { execSync } = require('child_process');
global.ll.import = ll.imports;
function GetLevelName() {
    if (ll.listPlugins().includes('GMLIB-LegacyRemoteCallApi')) {
        const { Minecraft } = require('../GMLIB-LegacyRemoteCallApi/lib/GMLIB_API-JS');
        return Minecraft.getWorldName();
    }
    return /level-name=(.*)/.exec(fs.readFileSync('./server.properties'))[1];
}
function system(cmd) {
    try {
        return execSync(cmd);
    } catch (e) {
        console.error(`命令执行失败，退出码: ${error.status}`);
        console.error(`错误输出: ${error.stderr?.toString()}`);
        throw e;
    }
}
function installAddon(filePath, isDir = false) {
    // 获取文件名和扩展名
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    // 校验文件类型
    if (!isDir && !['.mcpack', '.mcaddon', '.zip'].includes(fileExt)) {
        logger.error(`不支持的文件类型: ${fileName}`);
        return false;
    }
    const tempPath = isDir ? filePath : path.join(filePath, '..', 'temp', fileName);
    try {
        if (!isDir) {
            if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { recursive: true });
            execSync(`7za x "${filePath}" -o"${tempPath}"`)
        }
        if (!fs.existsSync(path.join(tempPath, 'manifest.json'))) {
            // logger.warn(`未在 ${fileName} 中找到 manifest.json 文件，正在递归查找`);
            let success = false;
            for (const fileName of File.getFilesList(tempPath)) {
                if (File.checkIsDir(path.join(tempPath, fileName))) {
                    let res = installAddon(path.join(tempPath, fileName), true);
                    if (res) success = true;
                } else if (['mcpack', 'mcaddon', 'zip'].includes(fileName.split('.').pop())) {
                    let res = installAddon(path.join(tempPath, fileName), false);
                    if (res) success = true;
                }
            }
            if (success) {
                File.delete(tempPath);
                File.delete(filePath);
            }
            return success;
        }
        logger.warn(`正在安装 ${fileName}`);
        const manifest = JSON5.parse(fs.readFileSync(path.join(tempPath, 'manifest.json')));// 为什么会有人在JSON里面写注释啊
        let type;
        if (['data', 'script'].includes(manifest.modules[0].type)) type = 'behavior';
        else if (manifest.modules[0].type === 'resources') type = 'resource';
        else {
            logger.error(`不支持的addon类型: ${manifest.modules[0].type}`);
            return false;
        }
        if (listInstalledPacks()[type].map(p => p.uuid).includes(manifest.header.uuid)) {
            logger.warn(`${fileName} 已存在，跳过安装`);
            return false;
        }
        const targetDir = path.join('./worlds', GetLevelName(), `${type}_packs`);

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);

        system(`powershell Move-Item -Force -LiteralPath "'${tempPath}'" -Destination "'${targetDir}/${fileName}_${manifest.header.uuid}'"`);
        const packsPath = `./worlds/${GetLevelName()}/world_${type}_packs.json`;
        const packsData = fs.existsSync(packsPath) ? JSON5.parse(fs.readFileSync(packsPath)) : [];
        packsData.push({
            pack_id: manifest.header.uuid,
            version: manifest.header.version
        });
        fs.writeFileSync(packsPath, JSON.stringify(packsData, null, 4));
        logger.info(`成功安装${type === 'behavior' ? '行为' : '资源'}包 ${manifest.header.name}`);
        File.delete(filePath);
        File.delete(tempPath);
        return true;
    } catch (error) {
        logger.error(`安装 ${fileName} 时出错：${error.message}`);
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

        if (fs.existsSync(packsDir)) {
            const dirs = File.getFilesList(packsDir)
                .filter(f => File.checkIsDir(`${packsDir}/${f}`));

            dirs.forEach(dirName => {
                const manifestPath = `${packsDir}/${dirName}/manifest.json`;
                try {
                    const manifest = JSON5.parse(fs.readFileSync(manifestPath));
                    // const registeredPath = `./worlds/${levelName}/world_${type}_packs.json`;
                    // const registeredPacks = fs.existsSync(registeredPath)
                    //     ? JSON5.parse(fs.readFileSync(registeredPath))
                    //     : [];
                    // const registeredInfo = registeredPacks.find(p => p.pack_id === manifest.header.uuid);

                    packs.push({
                        uuid: manifest.header.uuid,
                        version: (Array.isArray(manifest.header.version)
                            ? manifest.header.version.join('.')
                            : manifest.header.version) || "未知",
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
    const packsData = fs.existsSync(packsPath)
        ? JSON5.parse(fs.readFileSync(packsPath))
        : [];
    const index = packsData.findIndex(p => p.pack_id === uuid);
    if (index === -1) return false;

    packsData.splice(index, 1);
    fs.writeFileSync(packsPath, JSON.stringify(packsData, null, 4));

    const targetDir = `${packsDir}/${targetPack.folderName}`;

    if (fs.existsSync(targetDir)) {
        if (File.delete(targetDir)) {
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
mc.listen('onServerStarted', () => {
    let cmd = mc.newCommand('addons', '管理服务器的Addon', PermType.Console);
    cmd.setEnum('enumList', ['list']);
    cmd.setEnum('enumAdd', ['Add']);
    cmd.setEnum('enumRemove', ['remove']);
    cmd.setEnum('enumType', ['b', 'r'])
    cmd.mandatory('enumList', ParamType.Enum, 'enumList', 1);
    cmd.mandatory('enumAdd', ParamType.Enum, 'enumAdd', 1);
    cmd.mandatory('enumRemove', ParamType.Enum, 'enumRemove', 1);
    cmd.mandatory('Path', ParamType.RawText);
    cmd.mandatory('uuid', ParamType.String);
    cmd.mandatory('type', ParamType.Enum, 'enumType', 1);
    cmd.overload(['enumList']);
    cmd.overload(['enumAdd', 'Path']);
    cmd.overload(['enumRemove', 'type', 'uuid']);
    cmd.setCallback((cmd, origin, output, results) => {
        if (results.enumList) {
            let list = listInstalledPacks();
            let out = `当前安装了${list.behavior.length}个行为包，${list.resource.length}个资源包\n`
            out += `\n行为包：\n`;
            out += list.behavior.map(p => `名称:${p.name}\n介绍:${p.description}\n版本:${p.version}\nuuid:${p.uuid}`).join('\n-----------------------\n');
            out += `\n\n资源包：\n`;
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
    if (!fs.existsSync('./plugins/AddonsManager/addons')) fs.mkdirSync('./plugins/AddonsManager/addons');
    const addonFiles = File.getFilesList('./plugins/AddonsManager/addons')
        .filter(f => !File.checkIsDir(f) && ['mcpack', 'mcaddon', 'zip'].includes(f.split('.').pop()));
    for (const f of addonFiles) {
        installAddon(`./plugins/AddonsManager/addons/${f}`);
    }
});