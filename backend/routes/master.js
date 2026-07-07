const express=require("express")
const router=express.Router()

const db=require("../config/db")


// GET Brands

router.get("/brands",(req,res)=>{

    db.query(
        "SELECT * FROM brands",
        (err,result)=>{

            if(err)
                return res.status(500).json(err)

            res.json(result)

        }
    )

})


// GET Buildings

router.get("/buildings",(req,res)=>{

    db.query(
        "SELECT * FROM buildings",
        (err,result)=>{

            if(err)
                return res.status(500).json(err)

            res.json(result)

        }
    )

})

router.post("/brands",(req,res)=>{

    const {name}=req.body

    db.query(
        "INSERT INTO brands(name) VALUES(?)",
        [name],
        (err,result)=>{

            if(err)
                return res.status(500).json(err)

            res.json({
                message:"Brand created"
            })

        }
    )

})
router.put("/brands/:id",(req,res)=>{

    const {name}=req.body

    db.query(
        "UPDATE brands SET name=? WHERE id=?",
        [name,req.params.id],
        (err)=>{

            if(err)
                return res.status(500).json(err)

            res.json({
                message:"Updated"
            })

        }
    )

})
router.delete("/brands/:id",(req,res)=>{

    db.query(
        "DELETE FROM brands WHERE id=?",
        [req.params.id],
        (err)=>{

            if(err)
                return res.status(500).json(err)

            res.json({
                message:"Deleted"
            })

        }
    )

})
module.exports=router