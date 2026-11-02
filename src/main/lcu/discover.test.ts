import { describe, expect, it } from 'vitest';
import {
  parseInstallDirectory,
  parseProcessLcuCredentials,
  parseProcessRiotCredentials,
} from './discover';

// 模拟国服 LeagueClientUx.exe 的真实命令行形态（引号包路径 + 一长串启动参数）。
const REAL_LIKE_COMMAND_LINE = [
  '"D:\\WeGameApps\\lol\\League of Legends\\LeagueClient\\LeagueClientUx.exe"',
  '--client-config-url=https://feacre.cdn.garenanow.com',
  '--install-directory="D:\\WeGameApps\\lol\\League of Legends"',
  '--app-port=52732',
  '--remoting-auth-token=AbCdEf_Gh-IjK',
  '--app-pid=12345',
  '--riotclient-app-port=52731',
  '--riotclient-auth-token=RtToken_9xY',
  '--rso_platform_id=HN1',
  '--locale=zh_CN',
].join(' ');

describe('parseInstallDirectory', () => {
  it('提取带引号的安装目录', () => {
    expect(parseInstallDirectory(REAL_LIKE_COMMAND_LINE)).toBe(
      'D:\\WeGameApps\\lol\\League of Legends',
    );
  });

  it('提取不带引号的安装目录（反斜杠结尾会被规范化掉）', () => {
    expect(
      parseInstallDirectory('C:\\x\\LeagueClientUx.exe --install-directory=E:\\LOL\\'),
    ).toBe('E:\\LOL');
  });

  it('用户直接选到 LeagueClient 子目录时归一化到安装根', () => {
    expect(
      parseInstallDirectory('x --install-directory="E:\\LOL\\LeagueClient"'),
    ).toBe('E:\\LOL');
  });

  it('没有 install-directory 参数时返回 null', () => {
    expect(parseInstallDirectory('C:\\LeagueClientUx.exe --app-port=1')).toBeNull();
  });
});

describe('parseProcessLcuCredentials', () => {
  it('从命令行提取端口、令牌与 pid', () => {
    expect(parseProcessLcuCredentials(REAL_LIKE_COMMAND_LINE)).toEqual({
      pid: '12345',
      port: '52732',
      token: 'AbCdEf_Gh-IjK',
      protocol: 'https',
    });
  });

  it('缺端口或令牌时返回 null', () => {
    expect(parseProcessLcuCredentials('x --app-port=1')).toBeNull();
    expect(parseProcessLcuCredentials('x --remoting-auth-token=abc')).toBeNull();
  });
});

describe('parseProcessRiotCredentials', () => {
  it('从命令行提取 Riot 客户端端口、令牌与平台 ID', () => {
    expect(parseProcessRiotCredentials(REAL_LIKE_COMMAND_LINE)).toEqual({
      port: '52731',
      token: 'RtToken_9xY',
      rsoPlatformId: 'HN1',
    });
  });

  it('缺任一必要参数时返回 null', () => {
    expect(parseProcessRiotCredentials('x --riotclient-app-port=1')).toBeNull();
  });
});
