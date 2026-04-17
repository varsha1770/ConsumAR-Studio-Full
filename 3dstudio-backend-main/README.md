 **🧊 3DStudio Backend (Resize + USDZ Conversion)**

📌 Overview

This backend service provides APIs for:

* 📏 Extracting dimensions from `.glb` files
* 🔄 Resizing 3D models to target dimensions
* 📦 Converting `.glb` files to `.usdz` format (for AR compatibility)

The system is designed for **robust processing**, using:

* Child processes for stability
* Logging for debugging
* AWS S3 for file storage

---

## 🏗️ Architecture

* **Flask API Server**
* **Child Process Execution** (prevents crashes from affecting main server)
* **AWS S3 Integration** (upload/download files)
* **Trimesh-based Geometry Processing**
* **Custom GLB → USDZ Conversion Pipeline**

Main server file:

* `Finalserver.py` → main backend file

---

## 📂 Project Structure

```
/home/ubuntu/Consumar_resize_backend

├── Finalserver.py      # Main backend (recommended)
├── server.py           # Simpler version
├── qlserver.py         # Queue-based processing version
├── resize.py           # GLB resizing logic
├── usdzconvert.py      # GLB → USDZ conversion
├── s3_utils.py         # AWS S3 upload/download
├── logbackend.py       # Logging utilities
```

---

## ⚙️ Features

### 1. Get Dimensions

* Extracts width, height, depth of a GLB file
* Uses Trimesh internally 

### 2. Resize Model

* Supports:

  * Uniform scaling
  * Non-uniform scaling
* Aligns model to ground automatically
* Handles unit conversion (cm, m, inch, ft)

### 3. Convert to USDZ

* Fully custom GLB parsing + texture extraction 
* Generates AR-compatible USDZ files

### 4. Robust Processing

* Child processes isolate heavy operations 
* Prevents server crashes
* Logs all operations

---

## 🚀 How to Run (Using PuTTY)

### 1. Connect to your server

Login using PuTTY.

---

### 2. Navigate to project

```bash
cd /home/ubuntu/Consumar_resize_backend
```

---

### 3. Activate virtual environment

```bash
source venv/bin/activate
```

---

### 4. Run server

```bash
python3 Finalserver.py
```

Server runs on:

```
http://0.0.0.0:5000
```

---

### 5. To Run in background 

```bash
nohup python3 Finalserver.py > server.log 2>&1 &
```

---

## 📁 Using WinSCP (File Transfer)

1. Open WinSCP
2. Connect to your EC2 instance
3. Navigate to:

```
/home/ubuntu/Consumar_resize_backend
```

4. Upload your files directly into this folder

---

## 📡 API Endpoints

### 🔹 1. Get Dimensions

```
POST /dimensions
```

**Body:**

```json
{
  "s3_key": "path/to/file.glb"
}
```

---

### 🔹 2. Resize Model

```
POST /resize
```

**Body:**

```json
{
  "s3_key": "file.glb",
  "width": 100,
  "height": 200,
  "depth": 50,
  "unit": "cm"
}
```

---

### 🔹 3. Convert to USDZ

```
POST /convert_usdz
```

**Body:**

```json
{
  "s3_key": "file.glb"
}
```

---

## 🧾 Logging

Logs are stored at:

```
/home/ubuntu/Log/server.log
```

Includes:

* Requests
* Errors
* Processing time
* Debug output from child processes

---

## ⚠️ Important Notes

* Virtual environment **must be activated**
* AWS S3 credentials must be configured
* Large or malformed GLB files may timeout
* Debug mode can be toggled in `Finalserver.py`

---
