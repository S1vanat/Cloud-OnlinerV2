var express = require("express");
var app = express();
var http = require("http").createServer(app);

var mongoose = require("mongoose");
var bodyParser = require("body-parser");
var bcrypt = require("bcrypt");

var formidable = require("formidable");
var fileSystem = require("fs");
var { getVideoDurationInSeconds } = require("get-video-duration");
const multer = require('multer');
const upload = multer({ dest: 'public/uploads' });

var expressSession = require("express-session");
const { ObjectId } = require("mongodb");
app.use(
  expressSession({
    key: "user_id",
    secret: "User secret Object Id",
    resave: true,
    saveUninitialized: true,
  })
);

//a function to return user's document
const database = mongoose.connection;

function getUser(id, callBack){
  database.collection("users").findOne({
    "_id": new ObjectId(id),
  }, function (error, user){
    callBack(error, user); // เพิ่ม parameter สำหรับ callback
  });
}


function getUser2(userId, callback) {
  database.collection("users").findOne({
      "_id": new ObjectId(userId),
      "subscriptions": { $exists: true, $ne: [] },
      "้history": { $exists: true, $ne: [] }
  }, function (error, user) {
      if (error) {
          callback(null);
      } else {
          callback(user);
      }
  });
}

function getUserHistory(userId, callback) {
  database.collection("users").findOne({
      "_id": new ObjectId(userId)
  }, function (error, user) {
      if (error) {
          callback(null);
      } else {
          callback(user ? user.history : null);
      }
  });
}



app.use(bodyParser.json({ limit: "10000mb" }));
app.use(
  bodyParser.urlencoded({
    extended: true,
    limit: "10000mb",
    parameterLimit: 1000000,
  })
);

app.use("/public", express.static(__dirname + "/public"));
app.set("view engine", "ejs");

http.listen(3000, function () {
  console.log("Server started at port 3000");

  mongoose
    .connect("mongodb://172.31.21.116:27017/Cloud-onliner", {
     
    })
    .then(() => {
      console.log("Connected to MongoDB successfully.");

      var userSchema = new mongoose.Schema({
        name: String,
        email: { type: String, unique: true },
        password: String,
        coverPhoto: String,
        image: String,
        subscribers: Number,
        subscriptions: [], //channels i have sub
        playlists: [],
        videos: [],
        history: [],
        notifications: [],
      });

      var User = mongoose.model("User", userSchema);

      app.get("/", async function (request, result) {
        try {
          const videos = await database.collection("videos").find({}).sort({ "createdAt": -1 }).toArray();
          result.render("index", {
            "isLogin": !!request.session.user_id,
            "videos": videos
          });
        } catch (error) {
          console.error("Error fetching videos:", error);
          result.status(500).send("Internal Server Error");
        }
      });

      app.get("/signup", function (request, result) {
        result.render("signup");
      });

      app.post("/signup", function (request, result) {
        //check if email exists
        User.findOne({ email: request.body.email })
          .then((user) => {
            if (!user) {
              //not exist

              //convert password to hash
              bcrypt
                .hash(request.body.password, 10)
                .then((hash) => {
                  var newUser = new User({
                    name: request.body.name,
                    email: request.body.email,
                    password: hash,
                    coverPhoto: "",
                    image: "",
                    subscribers: 0,
                    subscriptions: [],
                    playlists: [],
                    videos: [],
                    history: [],
                    notifications: [],
                  });

                  newUser
                    .save()
                    .then(() => {
                      result.redirect("/login");
                    })
                    
                })
                
            } else {
              //exists
              result.send("Email already exists.");
            }
          })
          .catch((error) => {
            console.error("Error checking email existence:", error);
            result.send("Error checking email existence.");
          });
      });
      app.get("/login", function (request, result) {
        result.render("login", {
          error: "",
          message: "",
        });
      });
      app.post("/login", function (request, result) {
        //check
        User.findOne({
          email: request.body.email,
        })
          .then((user) => {
            if (user === null) {
              result.send("Email does not exist");
            } else {
              //compare hashed password
              bcrypt
                .compare(request.body.password, user.password)
                .then((isVerify) => {
                  if (isVerify) {
                    // save user id in session
                    request.session.user_id = user._id;
                    result.redirect("/");
                  } else {
                    result.send("Password is not correct");
                  }
                })
                
            }
          })
          
      });
      app.get("/logout", function (request, result){
        request.session.destroy();
        result.redirect("/");
      });
      app.get("/upload", function (request, result) {
        if (request.session.user_id){
          //create new page for upload
          result.render("upload", {
            "isLogin" : true
          });
        } else {
          result.redirect("/login")
        }
      });

      app.post("/upload-video", function (request, result){
        //check if user is logged in
        if (request.session.user_id){
          
          var formData = new formidable.IncomingForm();
          formData.maxFileSize = 1000 * 1024 * 1024;
          formData.parse(request, function (error, fields, files){
            
            var title = fields.title;
            var description = fields.description;
            var tags = fields.tags;
            var category = fields.category;

            var oldPathVideo = files.video[0].filepath;
            var oldPathThumbnail = files.thumbnail[0].filepath;

            var newPath = "public/videos/" + new Date().getTime() + "-" + files.video[0].originalFilename;
            // var newpath = "public/videos/" + files.video[0].originalFilename;
            var thumbnail = "public/thumbnails/" + new Date().getTime() + "-" + files.thumbnail[0].originalFilename;
            console.log(files);
    
            fileSystem.rename(oldPathThumbnail, thumbnail, function (error2) {
              console.log("อัพโหลดได้ อย่างเจ๋ง = ", error2);
            });
  
            fileSystem.rename(oldPathVideo, newPath, function (error2) {
              getUser(request.session.user_id, function (error, user) {

                var currentTime = new Date().getTime();
              
                getVideoDurationInSeconds(newPath).then((duration) => {
              
                  var hours = Math.floor(duration / 60 / 60);
                  var minutes = Math.floor(duration / 60) - (hours * 60);
                  var seconds = Math.floor(duration % 60);
              
                  database.collection("videos").insertOne({
                    "user": {
                      "_id": user._id, // เปลี่ยนจาก request.session.user_id เป็น user._id
                      "name": user.name,
                      "image": user.image,
                      // "subscribers": user.subscribers
                    },
                    "filePath": newPath,
                    "thumbnail": thumbnail,
                    "title": title,
                    "description": description,
                    "tags": tags,
                    "category": category.join(', '),
                    "createdAt": currentTime,
                    "minutes": minutes,
                    "seconds": seconds,
                    "hours": hours,
                    "watch": currentTime,
                    "views": 0,
                    "playlist":"",
                    
                   
                  }, function (error3, data) {
  
                    database.collection("users").updateOne({
                      "_id": new ObjectId(request.session.user_id)
                    }, {
                      $push: {
                        "videos": {
                          "_id": data.insertedId,
                          "title": title,
                          "views": 0,
                          "thumbnail": thumbnail,
                          "watch": currentTime,
                          
                        }
                      }
                    });
                    result.redirect("/");
                  });
                });
              });
            });
          });
        }
      })

      app.get("/watch/:watch", function (request, result) {
        database.collection("videos").findOne({
          "watch": parseInt(request.params.watch)
        }, function (error, video){
          if (video == null){
            result.send("Video does not exists");
          } else {

            //increment views counter
            database.collection("videos").updateOne({
              "_id": new ObjectId(video._id)
            }, {
              $inc :{
                "views": 1
              }
            });

            result.render("video-page/index", {
              "isLogin": request.session.user_id ? true : false,
              "video": video
            })
          }
        });
      })

      app.post("/do-subscribe", function (request, result) {
        if (request.session.user_id) {
            database.collection("videos").findOne({
                "_id": new ObjectId(request.body.videoId)
            }, function (error1, video) {
                if (error1) {
                    result.json({
                        "status": "error",
                        "message": "An error occurred while finding video"
                    });
                } else {
                    if (!video) {
                        result.json({
                            "status": "error",
                            "message": "Video not found"
                        });
                    } else if (request.session.user_id == video.user._id) {
                        result.json({
                            "status": "error",
                            "message": "You cannot subscribe on your own channel"
                        });
                    } else {
                        getUser2(request.session.user_id, function (user) {
                            if (user) {
                                var flag = false;
                                for (var index in user.subscriptions) {
                                    if (video.user._id.toString() == user.subscriptions[index]._id.toString()) {
                                        flag = true;
                                        break;
                                    }
                                }
                                if (flag) {
                                    result.json({
                                        "status": "error",
                                        "message": "Already subscribed"
                                    });
                                } 
                            } else {
                              database.collection("users").findOneAndUpdate({
                                "_id": video.user._id,
                              }, {
                                $inc:{
                                  "subscribers": 1
                                }
                              }, {
                                returnOriginal: false
                              }, function(error2, user){
                
                                database.collection("users").updateOne({
                                  "_id": new ObjectId(request.session.user_id)
                                }, {
                                  $push:{
                                    "subscriptions": {
                                      "_id": video.user._id,
                                      "name": video.user.name,
                                      
                                      // "image": user.value.image
                                    }
                                  }
                                  
                                }, function (error3, data){
                
                                  database.collection("videos").findOneAndUpdate({
                                    "_id": new ObjectId(request.body.videoId)
                                  }, {
                                    $inc: {
                                      "user.subscribers" : 1
                                    }
                                  });
                
                                  result.json({
                                    "status":"error",
                                    "message":"Subscription has been added"
                                    
                                  });
                                })
                              })
                            }
                        })
                    }
                }
            });
        } else {
            result.json({
                "status": "error",
                "message": "Please login to perform this action."
            })
        }
    });
    
    app.get("/get-related-videos/:videoId", function (request, result) {
      var videoId = request.params.videoId;
      database.collection("videos").distinct("title", {"category": videoId}, function(error, titles) {
        if (error) {
            console.log("Error fetching titles:", error);
            result.status(500).send("Error fetching titles");
            return;
        }
    
        result.json(titles);
    });
    })
  
    app.post("/save-history", function (request, result) {
      if (request.session.user_id) {
        database.collection("videos").findOne({
          "_id": new ObjectId(request.body.videoId)
        }, function (error, video) {
          database.collection("users").findOne({
            $and: [{
              "_id": new ObjectId(request.session.user_id)
            }, {
              "history.videoId": request.body.videoId
            }]
          }, function (error, history) {
            // only push
            if (history == null) {
              database.collection("users").updateOne({
                "_id": new ObjectId(request.session.user_id)
              }, {
                $push: {
                  "history": {
                    "_id": new ObjectId(),
                    "videoId": request.body.videoId,
                    "watch": video.watch,
                    "title": video.title,
                    "watched": request.body.watched,
                    "thumbnail": video.thumbnail,
                    "minutes": video.minutes,
                    "seconds": video.seconds
                  }
                }
              });
    
              result.json({
                "status": "error",
                "message": "History has been added"
              });
            } else {
              database.collection("users").updateOne({
                $and: [{
                  "_id": new ObjectId(request.session.user_id)
                }, {
                  "history.videoId": request.body.videoId
                }]
              }, {
                $set: {
                  "history.$.watched": request.body.watched
                }
              });
    
              result.json({
                "status": "error",
                "message": "History has been updated"
              });
            }
          });
        });
      } else {
        result.json({
          "status": "error",
          "message": "Please login to perform this action"
        });
      }
    });
    
    app.get("/watch-history", function (request, result) {
      if (request.session.user_id){
        
        getUserHistory(request.session.user_id, function (user) {
          if (user) {
            // console.log(user)
            result.render("watch-history", {
                "isLogin":true,
                "videos": user
            })
          
          } else {
            result.redirect("/login");
          }
        });
      } else {
        result.redirect("/login");
      }
    });
    
    app.post("/delete-form-history", function(request, result) {
      if (request.session.user_id){
        database.collection("users").updateOne({
          $and: [{
            "_id": new ObjectId(request.session.user_id)
          }, {
            "history.videoId": request.body.videoId
          }]
        }, {
          $pull:{
            "history": {
              "videoId" : request.body.videoId
            }
          }
        });

        result.redirect("/watch-history");
      } else {
        result.redirect("/login");
      }
    });

    app.get("/get_user", function (request, result) {
      if (request.session.user_id) {
          getUser(request.session.user_id, function (error, user) {
              if (error) {
                  result.json({
                      "status": "error",
                      "message": "Error retrieving user data"
                  });
              } else {
                  result.json({
                      "status": "success",
                      "message": "Record has been fetched",
                      "user": user
                  });
              }
          });
      } else {
          result.json({
              "status": "error",
              "message": "Please login to perform this action"
          });
      }
  });
  
  app.get("/channel/:_id", function (request, result) {
    getUser(request.params._id, function (error, user) {
        if (error || !user) { // เพิ่มการตรวจสอบ error หรือ user
            result.send("Channel not found");
        } else {
            result.render("single-channel", {
                "isLogin": request.session.user_id ? true : false,
                "user": user,
                "isMyChannel": request.session.user_id == user._id
            });
        }
    });
});
  
app.post("/change-profile-picture", function (request, result) {
  if (request.session.user_id){
    var formData = new formidable.IncomingForm();
    formData.parse(request, function (error, fields, files) {
      var oldPath = files.image[0].filepath;
      var newPath = "public/profiles/" + request.session.user_id +" "+ files.image.name;
      fileSystem.rename(oldPath, newPath, function (error){
        database.collection("users").updateOne({
          "_id": new ObjectId(request.session.user_id)
        }, {
          $set: {
            "image": newPath
          }
        });
        database.collection("users").updateOne({
          "subscriptions._id": new ObjectId(request.session.user_id)
        }, {
          $set: {
            "subscription._id": newPath
          }
        });
        database.collection("videos").updateOne({
          "user._id":new ObjectId(request.session.user_id)
        }, {
          $set:{
            "user.image": newPath
          }
        });
        result.redirect("/channel/" + request.session.user_id);
      });
    });
  } else {
    result.redirect("/login");
  }
})

app.post("/change-cover-picture", function(request, result){
  if (request.session.user_id) {
    var formData = new formidable.IncomingForm();
    formData.parse(request, function (error, fields, files){
      var oldPath = files.image[0].filepath;
      var newPath = "public/covers/" + request.session.user_id + " " + files.image.name;
      fileSystem.rename(oldPath, newPath, function (error) {
        database.collection("users").updateOne({
          "_id": new ObjectId(request.session.user_id)
        }, {
          $set: {
            "coverPhoto": newPath
          }
        });
        result.redirect("/channel/" + request.session.user_id);
      });
    });
  } else {
    result.redirect("/login")
  }
});

  app.get("/edit/:watch", function (request, result) {
    if (request.session.user_id) {
      database.collection("videos").findOne({
        $and: [{
          "watch": parseInt(request.params.watch)
        }, {
          "user._id":new ObjectId(request.session.user_id)
        }]
      }, function (error, video){
        if (video == null) {
          result.send("ไม่สามารถแก้ไขคลิปคนอื่นได้");
        } else {
          result.render("edit-video", {
            "isLogin": true,
            "video": video
          });
        }
      });
    } else {
      result.redirect("/login")
    }
  });

  app.post("/edit", upload.single('thumbnail'), function (request, result) {
    if (request.session.user_id) {
        database.collection("videos").findOne({
            $and: [{
                "_id": new ObjectId(request.body.video)
            }, {
                "user._id": new ObjectId(request.session.user_id)
            }]
        }, function (error, mainVideo) {
            if (mainVideo == null) {
                result.send("คุณไม่ใช่เจ้าของคลิปนี้");
            } else {
                // ตรวจสอบว่ามีการอัปโหลดภาพใหม่หรือไม่
                var newPath = mainVideo.thumbnail; // ใช้ค่าเดิมเป็นค่าเริ่มต้น
                if (request.file && request.file.size > 0) {
                    var oldPath = request.file.path;
                    newPath = "public/covers/" + request.session.user_id + " " + request.file.originalname;
                    
                    fileSystem.rename(oldPath, newPath, function (error) {
                        if (error) {
                            console.log(error);
                        }
                    });
                }
                
                database.collection("videos").findOneAndUpdate({
                    "_id": new ObjectId(request.body.video)
                }, {
                    $set: {
                        "title": request.body.title,
                        "description": request.body.description,
                        "tags": request.body.tags,
                        "category": request.body.category,
                        "thumbnail": newPath // ใช้ newPath ที่เป็นที่อยู่ของไฟล์ใหม่หรือเดิม
                    }
                }, function (error, data) {
                    database.collection("users").findOneAndUpdate({
                        $and: [{
                            "_id": new ObjectId(request.session.user_id)
                        }, {
                            "videos._id": new ObjectId(request.body.video)
                        }]
                    }, {
                        $set: {
                            "videos.$.title": request.body.title,
                            "videos.$.thumbnail": newPath // ใช้ newPath ที่เป็นที่อยู่ของไฟล์ใหม่หรือเดิม
                        }
                    });
                    result.redirect("/edit/" + mainVideo.watch);
                });
            }
        });
    } else {
        result.redirect("/login");
    }
});

app.post("/delete-video", function (request, result) {
  if (request.session.user_id) {
    database.collection("videos").findOne({
      $and: [{
        "_id": new ObjectId(request.body._id)
      }, {
        "user._id": new ObjectId(request.session.user_id)
      }]
    }, function (error, video) {
      if (video == null) {
        result.send("ไม่สามารถลบคลิปของคนอื่นได้");
        return;
      }
      fileSystem.unlink(video.filePath, function (error) {
        fileSystem.unlink(video.thumbnail, function (error) {
          //
        });
      });
      database.collection("videos").deleteOne({
        $and: [{
          "_id": new ObjectId(request.body._id)
        }, {
          "user._id": new ObjectId(request.session.user_id)
        }]
      }, function (error, res) {
        if (error) {
          console.log("Error deleting video:", error);
        }
      });
      database.collection("users").findOneAndUpdate({
        "_id": new ObjectId(request.session.user_id)
      }, {
        $pull: {
          "videos": {
            "_id": new ObjectId(request.body._id)
          }
        }
      }, function (error, res) {
        if (error) {
          console.log("Error updating user:", error);
        }
      });
      database.collection("users").updateMany({}, {
        $pull: {
          "history": {
            "videoId": request.body._id.toString()
          }
        }
      }, function (error, res) {
        if (error) {
          console.log("Error updating history:", error);
        }
      });
      result.redirect("/channel/" + request.session.user_id);
    });
  } else {
    result.redirect("/login");
  }
});


    });
});
