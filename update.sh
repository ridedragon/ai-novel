#!/bin/bash

# ============================================
# AI小说家 - 项目更新脚本
# ============================================

echo ""
echo "============================================"
echo "       AI小说家 - 项目更新程序"
echo "============================================"
echo ""

# 检查Git状态
echo "【步骤1/6】检查Git仓库状态..."
echo "--------------------------------------------"

# 检查是否为Git仓库
if [ ! -d ".git" ]; then
    echo "错误: 当前目录不是Git仓库，无法进行更新。"
    echo "请确保在项目根目录下运行此脚本。"
    exit 1
fi

# 获取当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    echo "错误: 无法获取当前分支信息。"
    exit 1
fi
echo "当前分支: $CURRENT_BRANCH"
echo ""

# 设置npm镜像
echo "【步骤2/6】设置npm镜像源..."
echo "--------------------------------------------"
echo "正在将npm镜像设置为国内镜像 (npmmirror.com)..."
npm config set registry https://registry.npmmirror.com
if [ $? -eq 0 ]; then
    echo "✓ npm镜像设置成功"
else
    echo "⚠ npm镜像设置失败，将使用默认源"
fi
echo ""

# 清理临时文件
echo "【步骤3/6】清理临时文件..."
echo "--------------------------------------------"
if [ -d "dev-dist" ]; then
    echo "正在删除 dev-dist 目录..."
    rm -rf dev-dist
    echo "✓ 临时文件清理完成"
else
    echo "无需清理，dev-dist 目录不存在"
fi
echo ""

# 获取远程更新
echo "【步骤4/6】获取远程仓库更新..."
echo "--------------------------------------------"
echo "正在连接远程仓库并获取最新代码..."
echo ""

# 先尝试非强制拉取
if git pull --no-rebase 2>&1 | tee /tmp/git_pull_output.txt; then
    PULL_RESULT=$?
    echo ""
    if [ $PULL_RESULT -eq 0 ]; then
        # 检查是否有实际更新
        if grep -q "Already up to date" /tmp/git_pull_output.txt; then
            echo "✓ 代码已是最新版本，无需更新"
        else
            echo "✓ 代码更新成功！"
        fi
    fi
else
    echo ""
    echo "⚠ 检测到更新冲突！"
    echo "--------------------------------------------"
    echo "冲突原因: 本地文件与远程仓库的修改存在冲突"
    echo "这通常是因为您在本地修改了文件后尝试更新代码。"
    echo ""

    # 显示冲突文件
    CONFLICT_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null)
    if [ -n "$CONFLICT_FILES" ]; then
        echo "冲突文件列表:"
        echo "$CONFLICT_FILES" | while read -r file; do
            echo "  - $file"
        done
        echo ""
    fi

    echo "============================================"
    echo "请选择处理方式:"
    echo "  输入 [y/Y] - 放弃本地修改，使用远程版本覆盖 (推荐)"
    echo "  输入 [n/N] - 取消更新，保留本地修改"
    echo "============================================"
    echo ""

    while true; do
        read -p "您的选择 [y/n]: " -n 1 -r user_input
        echo ""

        if [[ "$user_input" =~ ^[Yy]$ ]]; then
            echo "正在执行远程版本覆盖..."
            echo "--------------------------------------------"

            # 暂存本地更改（可选恢复）
            echo "正在暂存本地修改..."
            git stash push -m "本地修改备份 - $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null
            STASH_RESULT=$?

            # 强制重置到远程分支
            echo "正在重置到远程版本..."
            if git fetch --all 2>&1; then
                if git reset --hard "origin/$CURRENT_BRANCH" 2>&1; then
                    echo "✓ 远程版本覆盖成功！"

                    # 如果有暂存的修改，提示用户
                    if [ $STASH_RESULT -eq 0 ]; then
                        echo ""
                        echo "您的本地修改已暂存，如需恢复请运行: git stash pop"
                    fi
                else
                    echo "⚠ 重置失败，尝试强制重置..."
                    git reset --hard --quiet "origin/$CURRENT_BRANCH"
                    if [ $? -eq 0 ]; then
                        echo "✓ 强制重置成功！"
                    else
                        echo "✗ 强制重置失败，请手动处理。"
                        exit 1
                    fi
                fi
            else
                echo "✗ 获取远程仓库信息失败，请检查网络连接。"
                exit 1
            fi
            break

        elif [[ "$user_input" =~ ^[Nn]$ ]]; then
            echo "已取消更新，保留本地修改。"
            echo "您可以手动处理冲突后再次运行更新脚本。"
            echo ""
            echo "提示: 您可以使用以下命令查看冲突:"
            echo "  git status"
            echo "  git diff"
            exit 0

        else
            echo ""
            echo "无效输入，请输入 y 或 n"
            echo ""
        fi
    done
fi

echo ""

# 更新依赖
echo "【步骤5/6】更新项目依赖..."
echo "--------------------------------------------"
echo "正在安装/更新依赖包，请稍候..."
echo ""

if npm install 2>&1 | tee /tmp/npm_install_output.txt; then
    echo ""
    if grep -q "up to date" /tmp/npm_install_output.txt; then
        echo "✓ 依赖已是最新版本"
    elif grep -q "added [0-9]* package" /tmp/npm_install_output.txt; then
        echo "✓ 依赖更新成功！"
    else
        echo "✓ 依赖检查完成"
    fi
else
    echo ""
    echo "✗ 依赖安装失败，请检查错误信息。"
    echo "提示: 您可以尝试手动运行 npm install 查看详细错误。"
    exit 1
fi

echo ""

# 完成
echo "【步骤6/6】更新完成！"
echo "============================================"
echo "✓ AI小说家项目更新成功！"
echo "============================================"
echo ""
echo "正在启动项目..."
echo ""

# 执行启动脚本
if [ -f "./start.sh" ]; then
    chmod +x ./start.sh 2>/dev/null
    ./start.sh
else
    echo "警告: 未找到 start.sh 启动脚本"
    echo "请手动运行以下命令启动项目:"
    echo "  npm run dev"
    exit 1
fi
