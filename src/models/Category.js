import mongoose from 'mongoose';

const { Schema, model, models } = mongoose;

const CategorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    icon: {
        type: String, // could be an emoji or icon name
    },
    color: {
        type: String, // hex code for charts
    }
}, { timestamps: true });

const Category = models.Category || model('Category', CategorySchema);

export default Category;
