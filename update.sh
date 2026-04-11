#!/bin/bash

# ============================================
# AI小说家 - 项目更新脚本
# ============================================

# 定义颜色
COLOR_RESET="\033[0m"
COLOR_RED="\033[31m"
COLOR_GREEN="\033[32m"
COLOR_YELLOW="\033[33m"
COLOR_BLUE="\033[34m"
COLOR_PURPLE="\033[35m"
COLOR_CYAN="\033[36m"
COLOR_WHITE="\033[37m"
COLOR_BOLD="\033[1m"

# 打印彩色标题
echo -e "${COLOR_CYAN}"
echo "============================================"
echo "       AI小说家 - 项目更新程序"
echo "============================================"
echo -e "${COLOR_RESET}"

# 检查Git状态
echo -e "${COLOR_YELLOW}【步骤1/6】${COLOR_RESET} ${COLOR_WHITE}检查Git仓库状态...${COLOR_RESET}"
echo -e "${COLOR_PURPLE}--------------------------------------------${COLOR_RESET}"

# 检查是否为Git仓库
if [ ! -d ".git" ]; then
    echo -e "${COLOR_RED}错误: 当前目录不是Git仓库，无法进行更新。${COLOR_RESET}"
    echo -e "${COLOR_RED}请确保在项目根目录下运行此脚本。${COLOR_RESET}"
    exit 1
fi

# 获取当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    echo -e "${COLOR_RED}错误: 无法获取当前分支信息。${COLOR_RESET}"
    exit 1
fi
echo -e "${COLOR_GREEN}当前分支: ${COLOR_BOLD}$CURRENT_BRANCH${COLOR_RESET}"
echo ""

# 设置npm镜像
echo -e "${COLOR_YELLOW}【步骤2/6】${COLOR_RESET} ${COLOR_WHITE}设置npm镜像源...${COLOR_RESET}"
echo -e "${COLOR_PURPLE}--------------------------------------------${COLOR_RESET}"
echo -e "${COLOR_CYAN}正在将npm镜像设置为国内镜像 (npmmirror.com)...${COLOR_RESET}"
npm config set registry https://registry.npmmirror.com 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${COLOR_GREEN}✓ npm镜像设置成功${COLOR_RESET}"
else
    echo -e "${COLOR_YELLOW}⚠ npm镜像设置失败，将使用默认源${COLOR_RESET}"
fi
echo ""

# 清理临时文件
echo -e "${COLOR_YELLOW}【步骤3/6】${COLOR_RESET} ${COLOR_WHITE}清理临时文件...${COLOR_RESET}"
echo -e "${COLOR_PURPLE}--------------------------------------------${COLOR_RESET}"
if [ -d "dev-dist" ]; then
    echo -e "${COLOR_CYAN}正在删除 dev-dist 目录...${COLOR_RESET}"
    rm -rf dev-dist
    echo -e "${COLOR_GREEN}✓ 临时文件清理完成${COLOR_RESET}"
else
    echo -e "${COLOR_WHITE}无需清理，dev-dist 目录不存在${COLOR_RESET}"
fi
echo ""

# 获取远程更新
echo -e "${COLOR_YELLOW}【步骤4/6】${COLOR_RESET} ${COLOR_WHITE}获取远程仓库更新...${COLOR_RESET}"
echo -e "${COLOR_PURPLE}--------------------------------------------${COLOR_RESET}"
echo -e "${COLOR_CYAN}正在连接远程仓库并获取最新代码...${COLOR_RESET}"
echo -e "${COLOR_WHITE}远程地址: https://github.com/ridedragon/ai-novel${COLOR_RESET}"
echo ""

# 先尝试非强制拉取
if git pull --no-rebase 2>&1 | tee /tmp/git_pull_output.txt; then
    PULL_RESULT=$?
    echo ""
    if [ $PULL_RESULT -eq 0 ]; then
        # 检查是否有实际更新
        if grep -q "Already up to date" /tmp/git_pull_output.txt; then
            echo -e "${COLOR_GREEN}✓ 代码已是最新版本，无需更新${COLOR_RESET}"
        else
            echo -e "${COLOR_GREEN}✓ 代码更新成功！${COLOR_RESET}"
        fi
    fi
else
    echo ""
    echo -e "${COLOR_RED}⚠ 检测到更新冲突！${COLOR_RESET}"
    echo -e "${COLOR_PURPLE}--------------------------------------------${COLOR_RESET}"
    echo -e "${COLOR_RED}冲突原因: 本地文件与远程仓库的修改存在冲突${COLOR_RESET}"
    echo -e "${COLOR_YELLOW}这通常是因为您在本地修改了文件后尝试更新代码。${COLOR_RESET}"
    echo ""

    # 显示冲突文件
    CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null)
    if [ -n "$CONFLICT_FILES" ]; then
        echo -e "${COLOR_RED}冲突文件列表:${COLOR_RESET}"
        echo "$CONFLICT_FILES" | while read -r file; do
            echo -e "${COLOR_YELLOW}  - $file${COLOR_RESET}"
        done
        echo ""
    fi

    echo -e "${COLOR_CYAN}============================================${COLOR_RESET}"
    echo -e "${COLOR_WHITE}${COLOR_BOLD}请选择处理方式:${COLOR_RESET}"
    echo -e "${COLOR_GREEN}  输入 [y/Y] - 放弃本地修改，使用远程版本覆盖 (推荐)${COLOR_RESET}"
    echo -e "${COLOR_RED}  输入 [n/N] - 取消更新，保留本地修改${COLOR_RESET}"
    echo -e "${COLOR_CYAN}============================================${COLOR_RESET}"
    echo ""

    while true; do
        read -p "您的选择 [y/n]: " -n 1 -r user_input
        echo ""

        if [[ "$user_input" =~ ^[Yy]$ ]]; then
            echo -e "${COLOR_YELLOW}正在执行远程版本覆盖...${COLOR_RESET}"
            echo -e "${COLOR_PURPLE}--------------------------------------------${COLOR_RESET}"

            # 暂存本地更改（可选恢复）
            echo -e "${COLOR_CYAN}正在暂存本地修改...${COLOR_RESET}"
            git stash push -m "本地修改备份 - $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
            STASH_RESULT=$?

            # 强制重置到远程分支
            echo -e "${COLOR_CYAN}正在重置到远程版本...${COLOR_RESET}"
            if git fetch --all 2>&1; then
                if git reset --hard "origin/$CURRENT_BRANCH" 2>&1; then
                    echo -e "${COLOR_GREEN}✓ 远程版本覆盖成功！${COLOR_RESET}"

                    # 如果有暂存的修改，提示用户
                    if [ $STASH_RESULT -eq 0 ]; then
                        echo ""
                        echo -e "${COLOR_WHITE}您的本地修改已暂存，如需恢复请运行: ${COLOR_CYAN}git stash pop${COLOR_RESET}"
                    fi
                else
                    echo -e "${COLOR_YELLOW}⚠ 重置失败，尝试强制重置...${COLOR_RESET}"
                    git reset --hard --quiet "origin/$CURRENT_BRANCH"
                    if [ $? -eq 0 ]; then
                        echo -e "${COLOR_GREEN}✓ 强制重置成功！${COLOR_RESET}"
                    else
                        echo -e "${COLOR_RED}✗ 强制重置失败，请手动处理。${COLOR_RESET}"
                        exit 1
                    fi
                fi
            else
                echo -e "${COLOR_RED}✗ 获取远程仓库信息失败，请检查网络连接。${COLOR_RESET}"
                exit 1
            fi
            break

        elif [[ "$user_input" =~ ^[Nn]$ ]]; then
            echo -e "${COLOR_WHITE}已取消更新，保留本地修改。${COLOR_RESET}"
            echo -e "${COLOR_WHITE}您可以手动处理冲突后再次运行更新脚本。${COLOR_RESET}"
            echo ""
            echo -e "${COLOR_YELLOW}提示: 您可以使用以下命令查看冲突:${COLOR_RESET}"
            echo -e "${COLOR_CYAN}  git status${COLOR_RESET}"
            echo -e "${COLOR_CYAN}  git diff${COLOR_RESET}"
            exit 0

        else
            echo ""
            echo -e "${COLOR_RED}无效输入，请输入 y 或 n${COLOR_RESET}"
            echo ""
        fi
    done
fi

echo ""

# 更新依赖
echo -e "${COLOR_YELLOW}【步骤5/6】${COLOR_RESET} ${COLOR_WHITE}更新项目依赖...${COLOR_RESET}"
echo -e "${COLOR_PURPLE}--------------------------------------------${COLOR_RESET}"
echo -e "${COLOR_CYAN}正在安装/更新依赖包，请稍候...${COLOR_RESET}"
echo ""

if npm install 2>&1 | tee /tmp/npm_install_output.txt; then
    echo ""
    if grep -q "up to date" /tmp/npm_install_output.txt; then
        echo -e "${COLOR_GREEN}✓ 依赖已是最新版本${COLOR_RESET}"
    elif grep -q "added [0-9]* package" /tmp/npm_install_output.txt; then
        echo -e "${COLOR_GREEN}✓ 依赖更新成功！${COLOR_RESET}"
    else
        echo -e "${COLOR_GREEN}✓ 依赖检查完成${COLOR_RESET}"
    fi
else
    echo ""
    echo -e "${COLOR_RED}✗ 依赖安装失败，请检查错误信息。${COLOR_RESET}"
    echo -e "${COLOR_YELLOW}提示: 您可以尝试手动运行 npm install 查看详细错误。${COLOR_RESET}"
    exit 1
fi

echo ""

# 完成
echo -e "${COLOR_YELLOW}【步骤6/6】${COLOR_RESET} ${COLOR_WHITE}更新完成！${COLOR_RESET}"
echo -e "${COLOR_CYAN}============================================${COLOR_RESET}"
echo -e "${COLOR_GREEN}${COLOR_BOLD}✓ AI小说家项目更新成功！${COLOR_RESET}"
echo -e "${COLOR_CYAN}============================================${COLOR_RESET}"
echo ""
echo -e "${COLOR_WHITE}正在启动项目...${COLOR_RESET}"
echo ""

# 执行启动脚本
if [ -f "./start.sh" ]; then
    chmod +x ./start.sh 2>/dev/null
    ./start.sh
else
    echo -e "${COLOR_YELLOW}警告: 未找到 start.sh 启动脚本${COLOR_RESET}"
    echo -e "${COLOR_WHITE}请手动运行以下命令启动项目:${COLOR_RESET}"
    echo -e "${COLOR_CYAN}  npm run dev${COLOR_RESET}"
    exit 1
fi
