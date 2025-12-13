#!/bin/bash

echo "Starting AI Novel Writer..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "Error installing dependencies. Please check your npm installation."
        exit 1
    fi
fi

echo "Starting development server..."
npm run dev
