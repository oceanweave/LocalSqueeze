import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { PublisherGithub } from '@electron-forge/publisher-github';

const config: ForgeConfig = {
  packagerConfig: {
    extraResource: ['THIRD_PARTY_NOTICES.md', 'licenses'],
    "asar": {
      "unpack": "**/node_modules/{sharp,@img,@neslinesli93}/**/*"
    },
    icon: './src/assets/icons/icon' // 不需要扩展名，Electron Forge会根据平台自动选择
    // 不进行macOS应用签名和公证
    // 架构通过命令行参数 --arch 或环境变量 npm_config_target_arch 指定
  },
  rebuildConfig: {},
  makers: [
    // Use canonical package names so Forge --targets keeps these options.
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'LocalSqueeze',
        title: 'LocalSqueeze',
        description: 'Image Compression Tool',
        setupIcon: './src/assets/icons/win/icon.ico',
        setupExe: 'LocalSqueeze-Setup.exe',
        noMsi: false,
        noDelta: true
      }
    },
    // 添加WiX安装程序，支持选择安装路径
    {
      name: '@electron-forge/maker-wix',
      config: {
        name: "LocalSqueeze",
        description: "Image Compression Tool",
        manufacturer: "freeany",
        icon: './src/assets/icons/win/icon.ico',
        ui: {
          chooseDirectory: true, // 允许用户选择安装路径
        },
        // 设置程序文件夹名称
        programFilesFolderName: "LocalSqueeze",
        // 设置快捷方式文件夹名称
        shortcutFolderName: "LocalSqueeze"
      },
      platforms: ['win32'] // 限制只在Windows平台上运行
    },
    // macOS
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: (arch: string) => ({
        name: `LocalSqueeze-${arch === 'arm64' ? 'apple-silicon' : 'intel'}`,
        icon: './src/assets/icons/icon.icns',
        format: 'ULFO'
      })
    },
    // Linux
    new MakerDeb({
      options: {
        icon: './src/assets/icons/png/512x512.png',
        categories: ['Utility']
      }
    }),
    new MakerRpm({
      options: {
        icon: './src/assets/icons/png/512x512.png',
        categories: ['Utility']
      }
    }),
    // 为所有平台创建ZIP包
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32', 'linux'],
      config: {}
    }
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'oceanweave',
        name: 'LocalSqueeze'
      },
      prerelease: process.env.NODE_ENV !== 'production',
      draft: true, // 始终发布为草稿，需要手动确认
      authToken: process.env.GITHUB_TOKEN,
      tagPrefix: 'v',
      generateReleaseNotes: true,
      // 改进的发布配置
      octokitOptions: {
        retry: {
          doNotRetry: ['HttpError'],
          retries: 3
        },
        throttle: {
          onRateLimit: (retryAfter: number, options: any) => {
            console.warn(`Request quota exhausted for request ${options.method} ${options.url}`);
            if (options.request.retryCount === 0) {
              return true;
            }
          },
          onSecondaryRateLimit: (retryAfter: number, options: any) => {
            console.warn(`Secondary rate limit hit for request ${options.method} ${options.url}`);
            return true;
          }
        }
      },
    })
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        }
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
    {
      name: "@timfish/forge-externals-plugin",
      config: {
        "externals": ["sharp", "@neslinesli93/qpdf-wasm"],
        "includeDeps": true
      }
    },
  ],
};

export default config;
