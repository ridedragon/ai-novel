#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}正在准备更新 AI 小说写作助手...${NC}"

# 1. 清理可能导致冲突的构建/生成文件
# dev-dist 是 VitePWA 插件在开发模式下生成的，经常会导致 git pull 冲突
if [ -d "dev-dist" ]; then
    echo -e "清理临时文件 (dev-dist)..."
    rm -rf dev-dist
fi

# 2. 配置国内镜像
echo -e "${YELLOW}正在配置国内镜像加速...${NC}"
# 配置 npm 国内镜像
npm config set registry https://registry.npmmirror.com
# 配置 git 国内镜像（使用 Gitee 镜像）
GITHUB_MIRROR="https://gitee.com/mirrors"

# 3. 尝试拉取更新
echo -e "${YELLOW}正在从 GitHub 拉取最新代码...${NC}"
# 尝试使用原始地址
if git pull; then
    echo -e "${GREEN}代码更新成功！${NC}"
    
    # 4. 更新依赖
    echo -e "${YELLOW}正在检查并更新依赖...${NC}"
    if npm install; then
        echo -e "${GREEN}依赖更新完成！${NC}"
        echo -e "${GREEN}现在你可以运行 ./start.sh 来启动程序了。${NC}"
    else
        echo -e "${RED}依赖更新失败。请检查网络连接或 npm 配置。${NC}"
    fi
else
    echo -e "${YELLOW}原始地址拉取失败，尝试使用国内镜像...${NC}"
    # 获取当前分支
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    # 获取当前远程仓库地址
    REMOTE_URL=$(git remote get-url origin)
    # 尝试使用 Gitee 镜像
    if git remote set-url origin "$GITHUB_MIRROR/$(echo $REMOTE_URL | sed 's|https://github.com/||')" && git pull; then
        echo -e "${GREEN}使用国内镜像代码更新成功！${NC}"
        
        # 恢复原始远程地址
        git remote set-url origin "$REMOTE_URL"
        
        # 4. 更新依赖
        echo -e "${YELLOW}正在检查并更新依赖...${NC}"
        if npm install; then
            echo -e "${GREEN}依赖更新完成！${NC}"
            echo -e "${GREEN}现在你可以运行 ./start.sh 来启动程序了。${NC}"
        else
            echo -e "${RED}依赖更新失败。请检查网络连接或 npm 配置。${NC}"
        fi
    else
        echo -e "${RED}更新遇到冲突。${NC}"
        echo -e "通常这是因为本地修改了文件，或者远程仓库的历史被重写。"
        
        # 恢复原始远程地址
        git remote set-url origin "$REMOTE_URL"
        
        # 询问是否强制更新
        read -p "是否强制覆盖本地修改以完成更新？(这将丢失所有未提交的更改) [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${YELLOW}正在强制重置本地仓库...${NC}"
            
            # 尝试使用原始地址
            if git fetch --all && git reset --hard origin/$BRANCH; then
                echo -e "${GREEN}强制重置成功。${NC}"
                
                echo -e "${YELLOW}正在更新依赖...${NC}"
                npm install
                
                echo -e "${GREEN}更新完成！请运行 ./start.sh 启动。${NC}"
            else
                echo -e "${YELLOW}原始地址重置失败，尝试使用国内镜像...${NC}"
                # 尝试使用 Gitee 镜像
                if git remote set-url origin "$GITHUB_MIRROR/$(echo $REMOTE_URL | sed 's|https://github.com/||')" && git fetch --all && git reset --hard origin/$BRANCH; then
                    echo -e "${GREEN}使用国内镜像强制重置成功。${NC}"
                    
                    # 恢复原始远程地址
                    git remote set-url origin "$REMOTE_URL"
                    
                    echo -e "${YELLOW}正在更新依赖...${NC}"
                    npm install
                    
                    echo -e "${GREEN}更新完成！请运行 ./start.sh 启动。${NC}"
                else
                    echo -e "${RED}强制重置失败。请尝试手动删除项目并重新 clone。${NC}"
                fi
            fi
        else
            echo -e "${YELLOW}更新已取消。${NC}"
        fi
    fi
fi
